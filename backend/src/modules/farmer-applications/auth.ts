import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import { getPrismaClient } from '../../config/database.js'
import { HttpError } from '../../middleware/errors.js'
import { validateBody } from '../../middleware/request-validation.js'
import { logger } from '../../utils/logger.js'
import { BrevoSmsError } from './brevo-sms-provider.js'
import type { SmsProvider } from './sms-provider.js'

const SESSION_COOKIE = 'mh_session'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30
const OTP_TTL_MS = 1000 * 60 * 5
const OTP_RESEND_MS = 1000 * 60
const OTP_MAX_ATTEMPTS = 5
const OTP_WINDOW_MS = 1000 * 60 * 15
const OTP_MAX_REQUESTS_PER_PHONE = 5
const OTP_MAX_REQUESTS_PER_IP = 20

const requestOtpSchema = z.object({
  phone: z.string().trim().min(10).max(16),
})

const verifyOtpSchema = z.object({
  phone: z.string().trim().min(10).max(16),
  challengeId: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/),
})

type SessionContext = {
  id: string
  userId: string
  csrfTokenHash: string
  sessionToken: string
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function getOtpSecret(): string {
  const secret = process.env.OTP_HASH_SECRET
  if (!secret || secret.length < 32) {
    throw new HttpError(503, 'OTP_NOT_CONFIGURED', 'Phone verification is not configured')
  }
  return secret
}

function hashOtp(phone: string, code: string, secret: string): string {
  return createHmac('sha256', secret).update(`${phone}:${code}`).digest('hex')
}

function hashIp(ip: string, secret: string): string {
  return createHmac('sha256', secret).update(`ip:${ip}`).digest('hex')
}

function csrfTokenForSession(sessionToken: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(`csrf:${sessionToken}`)
    .digest('base64url')
}

function hashesMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

export function normalizeIndianPhone(value: string): string | undefined {
  const digits = value.replace(/[\s()-]/g, '')
  if (/^[6-9]\d{9}$/.test(digits)) return `+91${digits}`
  if (/^\+91[6-9]\d{9}$/.test(digits)) return digits
  return undefined
}

function readSessionToken(cookieHeader: string | undefined): string | undefined {
  const cookie = cookieHeader
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
  return cookie?.slice(SESSION_COOKIE.length + 1)
}

function setSessionCookie(response: Parameters<RequestHandler>[1], token: string): void {
  const production = process.env.NODE_ENV === 'production'
  const secure = production ? '; Secure' : ''
  const sameSite = production ? 'None' : 'Lax'
  response.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=${sameSite}; Path=/; Max-Age=${SESSION_TTL_MS / 1000}${secure}`,
  )
}

function clearSessionCookie(response: Parameters<RequestHandler>[1]): void {
  const production = process.env.NODE_ENV === 'production'
  const secure = production ? '; Secure' : ''
  const sameSite = production ? 'None' : 'Lax'
  response.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=; HttpOnly; SameSite=${sameSite}; Path=/; Max-Age=0${secure}`,
  )
}

export const requireApplicantSession: RequestHandler = async (request, response, next) => {
  try {
    const token = readSessionToken(request.headers.cookie)
    if (!token) throw new HttpError(401, 'SESSION_REQUIRED', 'Sign in to continue')

    const session = await getPrismaClient().authSession.findFirst({
      where: {
        tokenHash: hash(token),
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: { status: 'ACTIVE' },
      },
      select: { id: true, userId: true, csrfTokenHash: true },
    })
    if (!session) throw new HttpError(401, 'SESSION_EXPIRED', 'Your session has expired')

    response.locals.session = { ...session, sessionToken: token } satisfies SessionContext
    next()
  } catch (error) {
    next(error)
  }
}

export const requireCsrfToken: RequestHandler = (request, response, next) => {
  const session = response.locals.session as SessionContext | undefined
  const token = request.get('X-CSRF-Token')
  if (!session || !token || !hashesMatch(hash(token), session.csrfTokenHash)) {
    next(new HttpError(403, 'CSRF_VALIDATION_FAILED', 'Refresh your session and try again'))
    return
  }
  next()
}

export function createAuthRouter(smsProvider?: SmsProvider): Router {
  const router = Router()

  router.post(
    '/otp/request',
    validateBody(requestOtpSchema),
    async (request, response) => {
      const phoneE164 = normalizeIndianPhone(request.body.phone)
      if (!phoneE164) {
        throw new HttpError(400, 'INVALID_PHONE', 'Enter a valid Indian mobile number')
      }
      if (!smsProvider) {
        throw new HttpError(
          503,
          'OTP_PROVIDER_UNAVAILABLE',
          'Phone verification is temporarily unavailable',
        )
      }

      const secret = getOtpSecret()
      const prisma = getPrismaClient()
      const now = new Date()
      const windowStart = new Date(now.getTime() - OTP_WINDOW_MS)
      const ipHash = hashIp(request.ip ?? request.socket.remoteAddress ?? 'unknown', secret)
      const code = String(randomInt(100000, 1000000))
      let challenge: { id: string }
      try {
        challenge = await prisma.$transaction(async (transaction) => {
          const [phoneRequests, ipRequests, latestChallenge] = await Promise.all([
            transaction.otpChallenge.count({
              where: { phoneE164, createdAt: { gte: windowStart } },
            }),
            transaction.otpChallenge.count({
              where: { ipHash, createdAt: { gte: windowStart } },
            }),
            transaction.otpChallenge.findFirst({
              where: { phoneE164 },
              orderBy: { createdAt: 'desc' },
              select: { resendAvailableAt: true },
            }),
          ])

          if (
            phoneRequests >= OTP_MAX_REQUESTS_PER_PHONE ||
            ipRequests >= OTP_MAX_REQUESTS_PER_IP
          ) {
            throw new HttpError(429, 'OTP_RATE_LIMITED', 'Please wait before requesting another code')
          }
          if (latestChallenge && latestChallenge.resendAvailableAt > now) {
            throw new HttpError(429, 'OTP_RESEND_COOLDOWN', 'Please wait before requesting another code')
          }

          await transaction.otpChallenge.updateMany({
            where: { phoneE164, consumedAt: null },
            data: { consumedAt: now },
          })
          return transaction.otpChallenge.create({
            data: {
              phoneE164,
              codeHash: hashOtp(phoneE164, code, secret),
              ipHash,
              expiresAt: new Date(now.getTime() + OTP_TTL_MS),
              resendAvailableAt: new Date(now.getTime() + OTP_RESEND_MS),
            },
            select: { id: true },
          })
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034'
        ) {
          throw new HttpError(429, 'OTP_RATE_LIMITED', 'Please wait before requesting another code')
        }
        throw error
      }

      try {
        await smsProvider.sendOtp(phoneE164, code)
      } catch (error) {
        logger.error(
          {
            requestId: response.locals.requestId,
            ...(error instanceof BrevoSmsError
              ? { providerFailure: error.failure, providerStatusCode: error.statusCode }
              : { errorName: error instanceof Error ? error.name : 'UnknownError' }),
          },
          'SMS OTP delivery failed',
        )
        await prisma.otpChallenge.update({
          where: { id: challenge.id },
          data: { consumedAt: new Date() },
        })
        throw new HttpError(
          503,
          'OTP_DELIVERY_FAILED',
          'We could not send a code right now. Please try again later',
        )
      }

      response.status(200).json({
        data: {
          challengeId: challenge.id,
          expiresInSeconds: OTP_TTL_MS / 1000,
          resendInSeconds: OTP_RESEND_MS / 1000,
          message: 'If this number can receive messages, a verification code has been sent',
        },
        error: null,
        meta: { requestId: response.locals.requestId },
      })
    },
  )

  router.post(
    '/otp/verify',
    validateBody(verifyOtpSchema),
    async (request, response) => {
      const phoneE164 = normalizeIndianPhone(request.body.phone)
      if (!phoneE164) {
        throw new HttpError(400, 'INVALID_PHONE', 'Enter a valid Indian mobile number')
      }

      const secret = getOtpSecret()
      const prisma = getPrismaClient()
      const now = new Date()
      const challenge = await prisma.otpChallenge.findFirst({
        where: {
          id: request.body.challengeId,
          phoneE164,
          consumedAt: null,
          expiresAt: { gt: now },
        },
      })
      if (!challenge) {
        throw new HttpError(400, 'OTP_INVALID_OR_EXPIRED', 'The code is invalid or has expired')
      }
      if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
        throw new HttpError(429, 'OTP_ATTEMPTS_EXCEEDED', 'Request a new code to continue')
      }

      const suppliedHash = hashOtp(phoneE164, request.body.code, secret)
      const isValid = hashesMatch(challenge.codeHash, suppliedHash)
      const sessionToken = randomBytes(32).toString('base64url')
      const csrfToken = csrfTokenForSession(sessionToken, secret)
      const previousSessionToken = readSessionToken(request.headers.cookie)
      const result = await prisma.$transaction(async (transaction) => {
        const claimed = await transaction.otpChallenge.updateMany({
          where: {
            id: challenge.id,
            consumedAt: null,
            expiresAt: { gt: now },
            attempts: { lt: OTP_MAX_ATTEMPTS },
          },
          data: { attempts: { increment: 1 }, ...(isValid ? { consumedAt: now } : {}) },
        })
        if (claimed.count !== 1) return { state: 'expired' as const }
        if (!isValid) {
          return {
            state: challenge.attempts + 1 >= OTP_MAX_ATTEMPTS ? 'limit' as const : 'invalid' as const,
          }
        }

        const user = await transaction.user.upsert({
          where: { phoneE164 },
          create: { phoneE164, phoneVerifiedAt: now },
          update: { phoneVerifiedAt: now },
          select: { id: true, status: true },
        })
        if (user.status !== 'ACTIVE') return { state: 'inactive' as const }

        if (previousSessionToken) {
          await transaction.authSession.updateMany({
            where: { tokenHash: hash(previousSessionToken), revokedAt: null },
            data: { revokedAt: now },
          })
        }
        await transaction.authSession.create({
          data: {
            userId: user.id,
            tokenHash: hash(sessionToken),
            csrfTokenHash: hash(csrfToken),
            expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
          },
        })
        return { state: 'verified' as const }
      })

      if (result.state === 'invalid') {
        throw new HttpError(400, 'OTP_INVALID', 'The code is incorrect')
      }
      if (result.state === 'limit') {
        throw new HttpError(429, 'OTP_ATTEMPTS_EXCEEDED', 'Request a new code to continue')
      }
      if (result.state === 'inactive') {
        throw new HttpError(403, 'ACCOUNT_UNAVAILABLE', 'This account cannot sign in')
      }
      if (result.state !== 'verified') {
        throw new HttpError(400, 'OTP_INVALID_OR_EXPIRED', 'The code is invalid or has expired')
      }

      setSessionCookie(response, sessionToken)
      response.status(200).json({
        data: { csrfToken },
        error: null,
        meta: { requestId: response.locals.requestId },
      })
    },
  )

  router.get('/session', requireApplicantSession, async (_request, response) => {
    const session = response.locals.session as SessionContext
    const csrfToken = csrfTokenForSession(session.sessionToken, getOtpSecret())
    await getPrismaClient().authSession.update({
      where: { id: session.id },
      data: { csrfTokenHash: hash(csrfToken), lastSeenAt: new Date() },
    })
    response.status(200).json({
      data: { csrfToken },
      error: null,
      meta: { requestId: response.locals.requestId },
    })
  })

  router.post('/logout', requireApplicantSession, requireCsrfToken, async (_request, response) => {
    const session = response.locals.session as SessionContext
    await getPrismaClient().authSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    })
    clearSessionCookie(response)
    response.status(200).json({
      data: { signedOut: true },
      error: null,
      meta: { requestId: response.locals.requestId },
    })
  })

  return router
}
