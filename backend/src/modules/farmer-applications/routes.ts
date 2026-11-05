import { createHash, randomBytes } from 'node:crypto'
import { FarmerApplicationStatus, FarmerExperience, Prisma } from '@prisma/client'
import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import { getPrismaClient } from '../../config/database.js'
import { HttpError } from '../../middleware/errors.js'
import { validateBody } from '../../middleware/request-validation.js'
import { normalizeIndianPhone, requireApplicantSession, requireCsrfToken } from './auth.js'

const CONSENT_VERSION = 'farmer-application-v1'

const applicantFieldsSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  contactPhone: z.string().trim().min(10).max(16).refine(
    (value) => normalizeIndianPhone(value) !== undefined,
    'Enter a valid Indian mobile number',
  ),
  locality: z.string().trim().min(2).max(160),
  block: z.string().trim().min(2).max(100),
  pinCode: z.string().regex(/^\d{6}$/),
  district: z.string().trim().min(2).max(100).default('Dhanbad'),
  state: z.string().trim().min(2).max(100).default('Jharkhand'),
  address: z.string().trim().max(300).optional(),
  preferredLanguage: z.enum(['en', 'hi']).default('en'),
  experience: z.nativeEnum(FarmerExperience).optional(),
  cultivationSpace: z.enum(['BALCONY', 'ROOM', 'SHED', 'OTHER']).optional(),
  trainingInterest: z.boolean().optional(),
})

export const farmerApplicationSchema = applicantFieldsSchema.extend({
  consent: z.literal(true),
  promotionalConsent: z.boolean().default(false),
})
export const farmerApplicationPatchSchema = applicantFieldsSchema

export const farmerApplicationReviewSchema = z.object({
  status: z.enum([
    FarmerApplicationStatus.APPROVED,
    FarmerApplicationStatus.REJECTED,
    FarmerApplicationStatus.CHANGES_REQUESTED,
  ]),
  confirm: z.literal(true),
  internalNote: z.string().trim().min(1).max(1000),
  applicantMessage: z.string().trim().min(1).max(1000).optional(),
}).superRefine((value, context) => {
  if (
    (value.status === FarmerApplicationStatus.REJECTED ||
      value.status === FarmerApplicationStatus.CHANGES_REQUESTED) &&
    !value.applicantMessage
  ) {
    context.addIssue({
      code: 'custom',
      path: ['applicantMessage'],
      message: 'An applicant-facing message is required for this decision',
    })
  }
})

type SessionContext = {
  id: string
  userId: string
  csrfTokenHash: string
}

const requireAdmin: RequestHandler = async (_request, response, next) => {
  try {
    const session = response.locals.session as SessionContext | undefined
    if (!session) throw new HttpError(401, 'SESSION_REQUIRED', 'Sign in to continue')

    const grant = await getPrismaClient().userRole.findFirst({
      where: {
        userId: session.userId,
        revokedAt: null,
        role: { code: 'ADMIN' },
      },
      select: { id: true },
    })
    if (!grant) throw new HttpError(403, 'ADMIN_REQUIRED', 'Administrator access is required')
    next()
  } catch (error) {
    next(error)
  }
}

function getSession(response: Parameters<RequestHandler>[1]): SessionContext {
  const session = response.locals.session as SessionContext | undefined
  if (!session) throw new HttpError(401, 'SESSION_REQUIRED', 'Sign in to continue')
  return session
}

function applicationReference(): string {
  return `MH-${new Date().getUTCFullYear()}-${randomBytes(5).toString('hex').toUpperCase()}`
}

function readApplicationReference(value: string | string[] | undefined): string {
  if (typeof value !== 'string' || !/^MH-\d{4}-[A-F0-9]{10}$/.test(value)) {
    throw new HttpError(400, 'INVALID_APPLICATION_REFERENCE', 'The application reference is invalid')
  }
  return value
}

function requestHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function getIdempotencyKey(value: string | undefined): string {
  if (!value || value.length > 200 || !/^[\w.-]+$/.test(value)) {
    throw new HttpError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Submit again to continue')
  }
  return value
}

function publicApplication(application: {
  reference: string
  status: FarmerApplicationStatus
  applicantMessage: string | null
  submittedAt: Date
  updatedAt: Date
}) {
  return {
    reference: application.reference,
    status: application.status,
    applicantMessage: application.applicantMessage,
    submittedAt: application.submittedAt,
    updatedAt: application.updatedAt,
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  )
}

function applicantData(input: {
  fullName: string
  contactPhone: string
  locality: string
  block: string
  pinCode: string
  district: string
  state: string
  address?: string
  preferredLanguage: 'en' | 'hi'
  experience?: FarmerExperience
  cultivationSpace?: 'BALCONY' | 'ROOM' | 'SHED' | 'OTHER'
  trainingInterest?: boolean
}) {
  return {
    fullName: input.fullName,
    contactPhoneE164: normalizeIndianPhone(input.contactPhone),
    locality: input.locality,
    block: input.block,
    pinCode: input.pinCode,
    district: input.district,
    state: input.state,
    address: input.address,
    preferredLanguage: input.preferredLanguage,
    experience: input.experience,
    cultivationSpace: input.cultivationSpace,
    trainingInterest: input.trainingInterest,
  }
}

function maskPhone(phone: string | null): string {
  if (!phone) return '—'
  return `${phone.slice(0, 3)}******${phone.slice(-2)}`
}

export function createFarmerApplicationsRouter(): Router {
  const router = Router()

  router.post(
    '/',
    requireApplicantSession,
    requireCsrfToken,
    validateBody(farmerApplicationSchema),
    async (request, response) => {
      const session = getSession(response)
      const verifiedEmail = await getPrismaClient().user.findFirst({
        where: { id: session.userId, email: { not: null }, emailVerifiedAt: { not: null } },
        select: { id: true },
      })
      if (!verifiedEmail) {
        throw new HttpError(403, 'EMAIL_VERIFICATION_REQUIRED', 'Verify your email before submitting an application')
      }
      const key = getIdempotencyKey(request.get('Idempotency-Key'))
      const inputHash = requestHash(request.body)
      const prisma = getPrismaClient()
      const existingKey = await prisma.idempotencyKey.findUnique({
        where: {
          actorId_operation_key: {
            actorId: session.userId,
            operation: 'farmer-application.create',
            key,
          },
        },
      })

      if (existingKey) {
        if (existingKey.requestHash !== inputHash) {
          throw new HttpError(409, 'IDEMPOTENCY_CONFLICT', 'This submission key was already used')
        }
        const existingApplication = await prisma.farmerApplication.findUnique({
          where: { userId: session.userId },
          select: {
            reference: true,
            status: true,
            applicantMessage: true,
            submittedAt: true,
            updatedAt: true,
          },
        })
        if (!existingApplication) {
          throw new HttpError(409, 'APPLICATION_EXISTS', 'An application already exists for this account')
        }
        response.status(200).json({
          data: publicApplication(existingApplication),
          error: null,
          meta: { requestId: response.locals.requestId },
        })
        return
      }

      const now = new Date()
      let applicationId: string
      try {
        applicationId = await prisma.$transaction(async (transaction) => {
          const application = await transaction.farmerApplication.create({
            data: {
              reference: applicationReference(),
              userId: session.userId,
              ...applicantData(request.body),
              consentAt: now,
              consentVersion: CONSENT_VERSION,
              promotionalConsent: request.body.promotionalConsent,
            },
            select: { id: true },
          })
          await transaction.farmerApplicationHistory.create({
            data: {
              applicationId: application.id,
              toStatus: FarmerApplicationStatus.PENDING_REVIEW,
              actorId: session.userId,
            },
          })
          await transaction.idempotencyKey.create({
            data: {
              actorId: session.userId,
              operation: 'farmer-application.create',
              key,
              requestHash: inputHash,
              resourceType: 'farmer-application',
              resourceId: application.id,
              expiresAt: new Date(now.getTime() + 1000 * 60 * 60 * 24),
            },
          })
          return application.id
        })
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new HttpError(409, 'APPLICATION_EXISTS', 'An application already exists for this account')
        }
        throw error
      }

      const application = await prisma.farmerApplication.findUniqueOrThrow({
        where: { id: applicationId },
        select: {
          reference: true,
          status: true,
          applicantMessage: true,
          submittedAt: true,
          updatedAt: true,
        },
      })
      response.status(201).json({
        data: publicApplication(application),
        error: null,
        meta: { requestId: response.locals.requestId },
      })
    },
  )

  router.get('/me', requireApplicantSession, async (_request, response) => {
    const session = getSession(response)
    const application = await getPrismaClient().farmerApplication.findUnique({
      where: { userId: session.userId },
      select: {
        reference: true,
        status: true,
        applicantMessage: true,
        submittedAt: true,
        updatedAt: true,
        fullName: true,
        contactPhoneE164: true,
        locality: true,
        block: true,
        pinCode: true,
        district: true,
        state: true,
        address: true,
        preferredLanguage: true,
        experience: true,
        cultivationSpace: true,
        trainingInterest: true,
      },
    })
    if (!application) throw new HttpError(404, 'APPLICATION_NOT_FOUND', 'No application has been submitted')
    response.status(200).json({
      data: {
        ...publicApplication(application),
        ...(application.status === FarmerApplicationStatus.CHANGES_REQUESTED
          ? {
              fullName: application.fullName,
              contactPhone: application.contactPhoneE164,
              locality: application.locality,
              block: application.block,
              pinCode: application.pinCode,
              district: application.district,
              state: application.state,
              address: application.address,
              preferredLanguage: application.preferredLanguage,
              experience: application.experience,
              cultivationSpace: application.cultivationSpace,
              trainingInterest: application.trainingInterest,
            }
          : {}),
      },
      error: null,
      meta: { requestId: response.locals.requestId },
    })
  })

  router.patch(
    '/me',
    requireApplicantSession,
    requireCsrfToken,
    validateBody(farmerApplicationPatchSchema),
    async (request, response) => {
      const session = getSession(response)
      const verifiedEmail = await getPrismaClient().user.findFirst({
        where: { id: session.userId, email: { not: null }, emailVerifiedAt: { not: null } },
        select: { id: true },
      })
      if (!verifiedEmail) {
        throw new HttpError(403, 'EMAIL_VERIFICATION_REQUIRED', 'Verify your email before updating an application')
      }
      const prisma = getPrismaClient()
      const updated = await prisma.$transaction(async (transaction) => {
        const current = await transaction.farmerApplication.findUnique({
          where: { userId: session.userId },
          select: { id: true, status: true },
        })
        if (!current) throw new HttpError(404, 'APPLICATION_NOT_FOUND', 'No application has been submitted')
        if (current.status !== FarmerApplicationStatus.CHANGES_REQUESTED) {
          throw new HttpError(409, 'APPLICATION_NOT_EDITABLE', 'This application cannot be edited right now')
        }

        const changed = await transaction.farmerApplication.updateMany({
          where: {
            id: current.id,
            status: FarmerApplicationStatus.CHANGES_REQUESTED,
          },
          data: {
            ...applicantData(request.body),
            status: FarmerApplicationStatus.PENDING_REVIEW,
            applicantMessage: null,
          },
        })
        if (changed.count !== 1) {
          throw new HttpError(409, 'APPLICATION_CHANGED', 'Refresh the application and try again')
        }
        await transaction.farmerApplicationHistory.create({
          data: {
            applicationId: current.id,
            fromStatus: current.status,
            toStatus: FarmerApplicationStatus.PENDING_REVIEW,
            actorId: session.userId,
          },
        })
        return transaction.farmerApplication.findUniqueOrThrow({
          where: { id: current.id },
          select: {
            reference: true,
            status: true,
            applicantMessage: true,
            submittedAt: true,
            updatedAt: true,
          },
        })
      })
      response.status(200).json({
        data: publicApplication(updated),
        error: null,
        meta: { requestId: response.locals.requestId },
      })
    },
  )

  return router
}

export function createAdminFarmerApplicationsRouter(): Router {
  const router = Router()
  router.use(requireApplicantSession, requireAdmin)

  router.get('/', async (request, response) => {
    const status = request.query.status
    if (
      status !== undefined &&
      !Object.values(FarmerApplicationStatus).includes(status as FarmerApplicationStatus)
    ) {
      throw new HttpError(400, 'INVALID_STATUS', 'The requested status is invalid')
    }
    const applications = await getPrismaClient().farmerApplication.findMany({
      where: status ? { status: status as FarmerApplicationStatus } : undefined,
      orderBy: { submittedAt: 'desc' },
      take: 100,
      select: {
        reference: true,
        fullName: true,
        district: true,
        locality: true,
        pinCode: true,
        status: true,
        submittedAt: true,
        contactPhoneE164: true,
      },
    })
    response.status(200).json({
      data: applications.map((application) => ({
        ...application,
        phone: maskPhone(application.contactPhoneE164),
      })),
      error: null,
      meta: { requestId: response.locals.requestId },
    })
  })

  router.get('/:reference', async (request, response) => {
    const reference = readApplicationReference(request.params.reference)
    const application = await getPrismaClient().farmerApplication.findUnique({
      where: { reference },
      select: {
        reference: true,
        fullName: true,
        state: true,
        district: true,
        locality: true,
        block: true,
        pinCode: true,
        contactPhoneE164: true,
        address: true,
        preferredLanguage: true,
        experience: true,
        cultivationSpace: true,
        trainingInterest: true,
        consentAt: true,
        promotionalConsent: true,
        status: true,
        applicantMessage: true,
        submittedAt: true,
        updatedAt: true,
        user: { select: { phoneE164: true, email: true } },
        history: {
          orderBy: { createdAt: 'desc' },
          select: {
            fromStatus: true,
            toStatus: true,
            internalNote: true,
            applicantMessage: true,
            createdAt: true,
          },
        },
      },
    })
    if (!application) throw new HttpError(404, 'APPLICATION_NOT_FOUND', 'The application was not found')
    const { user, contactPhoneE164, ...details } = application
    response.status(200).json({
      data: {
        ...details,
        email: user.email,
        phone: contactPhoneE164 ?? user.phoneE164,
      },
      error: null,
      meta: { requestId: response.locals.requestId },
    })
  })

  router.patch(
    '/:reference/review',
    requireCsrfToken,
    validateBody(farmerApplicationReviewSchema),
    async (request, response) => {
      const session = getSession(response)
      const reference = readApplicationReference(request.params.reference)

      const now = new Date()
      const reviewed = await getPrismaClient().$transaction(async (transaction) => {
        const application = await transaction.farmerApplication.findUnique({
          where: { reference },
        })
        if (!application) throw new HttpError(404, 'APPLICATION_NOT_FOUND', 'The application was not found')
        if (application.userId === session.userId) {
          throw new HttpError(403, 'SELF_REVIEW_FORBIDDEN', 'Administrators cannot review their own application')
        }
        if (
          application.status !== FarmerApplicationStatus.PENDING_REVIEW &&
          application.status !== FarmerApplicationStatus.CHANGES_REQUESTED
        ) {
          throw new HttpError(409, 'INVALID_REVIEW_TRANSITION', 'This application has already been reviewed')
        }

        if (request.body.status === FarmerApplicationStatus.APPROVED) {
          const farmerRole = await transaction.role.findUnique({ where: { code: 'FARMER' } })
          if (!farmerRole) {
            throw new HttpError(503, 'FARMER_ROLE_NOT_CONFIGURED', 'Farmer account provisioning is not configured')
          }
          const profile = await transaction.farmerProfile.findUnique({
            where: { userId: application.userId },
            select: { id: true },
          })
          if (!profile) {
            await transaction.farmerProfile.create({
              data: {
                userId: application.userId,
                fullName: application.fullName,
                state: application.state,
                district: application.district,
                locality: application.locality,
                block: application.block,
                pinCode: application.pinCode,
              },
            })
          }
          const activeGrant = await transaction.userRole.findFirst({
            where: {
              userId: application.userId,
              roleId: farmerRole.id,
              revokedAt: null,
            },
            select: { id: true },
          })
          if (!activeGrant) {
            await transaction.userRole.create({
              data: {
                userId: application.userId,
                roleId: farmerRole.id,
                grantedById: session.userId,
                grantReason: `Farmer application ${application.reference} approved`,
              },
            })
          }
        }

        const moved = await transaction.farmerApplication.updateMany({
          where: {
            id: application.id,
            status: application.status,
          },
          data: {
            status: request.body.status,
            applicantMessage: request.body.applicantMessage ?? null,
          },
        })
        if (moved.count !== 1) {
          throw new HttpError(409, 'APPLICATION_CHANGED', 'Refresh the application and try again')
        }
        await transaction.farmerApplicationHistory.create({
          data: {
            applicationId: application.id,
            fromStatus: application.status,
            toStatus: request.body.status,
            actorId: session.userId,
            internalNote: request.body.internalNote,
            applicantMessage: request.body.applicantMessage,
            createdAt: now,
          },
        })
        return transaction.farmerApplication.findUniqueOrThrow({
          where: { id: application.id },
          select: {
            reference: true,
            status: true,
            applicantMessage: true,
            submittedAt: true,
            updatedAt: true,
          },
        })
      })

      response.status(200).json({
        data: publicApplication(reviewed),
        error: null,
        meta: { requestId: response.locals.requestId },
      })
    },
  )

  return router
}
