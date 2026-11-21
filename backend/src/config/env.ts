import { z } from 'zod'

const databaseUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    if (!URL.canParse(value)) return false
    const protocol = new URL(value).protocol
    return protocol === 'postgres:' || protocol === 'postgresql:'
  }, 'Expected a PostgreSQL connection URL')

const corsOriginsSchema = z
  .string()
  .default('http://localhost:5173')
  .transform((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean))
  .pipe(
    z.array(z.string().url()).min(1).refine(
      (origins) =>
        origins.every((origin) => {
          if (origin === '*') return false
          const parsed = new URL(origin)
          return (
            (parsed.protocol === 'https:' ||
              (parsed.protocol === 'http:' &&
                ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname))) &&
            parsed.username === '' &&
            parsed.password === '' &&
            parsed.pathname === '/' &&
            parsed.search === '' &&
            parsed.hash === ''
          )
        }),
      'CORS origins must be exact HTTPS origins (HTTP is limited to loopback development)',
    ),
  )

const environmentSchema = z.object({
  DATABASE_URL: databaseUrlSchema,
  DIRECT_DATABASE_URL: databaseUrlSchema,
  BREVO_API_KEY: z.preprocess(
    (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().trim().min(1).optional(),
  ),
  BREVO_SMS_SENDER: z.preprocess(
    (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().trim().min(3).max(15)
      .regex(/^(?:[A-Za-z0-9]{3,11}|\d{1,15})$/)
      .optional(),
  ),
  BREVO_SMS_ENABLED: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  BREVO_SMS_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(10000),
  BREVO_EMAIL_SENDER: z.preprocess(
    (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().email().optional(),
  ),
  BREVO_EMAIL_SENDER_NAME: z.preprocess(
    (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().trim().min(1).max(100).optional(),
  ),
  BREVO_EMAIL_ENABLED: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  BREVO_EMAIL_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(10000),
  GOOGLE_SHEETS_WEB_APP_URL: z.preprocess(
    (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().url().optional(),
  ),
  GOOGLE_SHEETS_WEB_APP_TOKEN: z.preprocess(
    (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().min(32).optional(),
  ),
  OTP_HASH_SECRET: z.preprocess(
    (value) => value === '' ? undefined : value,
    z.string().min(32).optional(),
  ),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  CORS_ORIGINS: corsOriginsSchema,
}).superRefine((environment, context) => {
  if (environment.BREVO_SMS_ENABLED) {
    if (!environment.BREVO_API_KEY) {
      context.addIssue({
        code: 'custom',
        path: ['BREVO_API_KEY'],
        message: 'BREVO_API_KEY is required when transactional SMS is enabled',
      })
    }
    if (!environment.BREVO_SMS_SENDER) {
      context.addIssue({
        code: 'custom',
        path: ['BREVO_SMS_SENDER'],
        message: 'BREVO_SMS_SENDER is required when transactional SMS is enabled',
      })
    }
    if (!environment.OTP_HASH_SECRET) {
      context.addIssue({
        code: 'custom',
        path: ['OTP_HASH_SECRET'],
        message: 'OTP_HASH_SECRET is required when transactional SMS is enabled',
      })
    }
  }
  if (environment.BREVO_EMAIL_ENABLED) {
    if (!environment.BREVO_API_KEY) {
      context.addIssue({
        code: 'custom',
        path: ['BREVO_API_KEY'],
        message: 'BREVO_API_KEY is required when transactional email is enabled',
      })
    }
    if (!environment.BREVO_EMAIL_SENDER) {
      context.addIssue({
        code: 'custom',
        path: ['BREVO_EMAIL_SENDER'],
        message: 'BREVO_EMAIL_SENDER is required when transactional email is enabled',
      })
    }
    if (!environment.BREVO_EMAIL_SENDER_NAME) {
      context.addIssue({
        code: 'custom',
        path: ['BREVO_EMAIL_SENDER_NAME'],
        message: 'BREVO_EMAIL_SENDER_NAME is required when transactional email is enabled',
      })
    }
    if (!environment.OTP_HASH_SECRET) {
      context.addIssue({
        code: 'custom',
        path: ['OTP_HASH_SECRET'],
        message: 'OTP_HASH_SECRET is required when transactional email is enabled',
      })
    }
  }

  if (Boolean(environment.GOOGLE_SHEETS_WEB_APP_URL) !== Boolean(environment.GOOGLE_SHEETS_WEB_APP_TOKEN)) {
    context.addIssue({
      code: 'custom',
      path: ['GOOGLE_SHEETS_WEB_APP_TOKEN'],
      message: 'Configure both Google Sheets web app settings together',
    })
  }

  const isLoopback = (hostname: string) =>
    ['localhost', '127.0.0.1', '[::1]'].includes(hostname)

  const runtimeUrl = URL.canParse(environment.DATABASE_URL)
    ? new URL(environment.DATABASE_URL)
    : undefined
  const directUrl = URL.canParse(environment.DIRECT_DATABASE_URL)
    ? new URL(environment.DIRECT_DATABASE_URL)
    : undefined

  const testDatabaseName = 'mushroom_hub_test'
  const rejectRemoteOrNeonHost = (field: 'DATABASE_URL' | 'DIRECT_DATABASE_URL', url: URL | undefined) => {
    if (!url) return
    const hostname = url.hostname.toLowerCase()
    if (!isLoopback(hostname)) {
      context.addIssue({
        code: 'custom',
        path: [field],
        message: `${field} must use a loopback hostname during local test runs`,
      })
    }
    if (hostname.includes('neon.') || hostname.includes('neontech') || hostname.includes('pooler')) {
      context.addIssue({
        code: 'custom',
        path: [field],
        message: `${field} must not point to a Neon hostname`,
      })
    }
    const dbName = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
    if (environment.NODE_ENV === 'test' && dbName !== testDatabaseName) {
      context.addIssue({
        code: 'custom',
        path: [field],
        message: `${field} must target the dedicated local test database mushroom_hub_test`,
      })
    }
  }

  if (environment.NODE_ENV === 'test') {
    rejectRemoteOrNeonHost('DATABASE_URL', runtimeUrl)
    rejectRemoteOrNeonHost('DIRECT_DATABASE_URL', directUrl)
  }

  if (
    runtimeUrl &&
    !isLoopback(runtimeUrl.hostname) &&
    !runtimeUrl.hostname.toLowerCase().includes('-pooler')
  ) {
    context.addIssue({
      code: 'custom',
      path: ['DATABASE_URL'],
      message: 'Runtime DATABASE_URL must use the Neon pooled endpoint',
    })
  }
  if (
    directUrl &&
    !isLoopback(directUrl.hostname) &&
    directUrl.hostname.toLowerCase().includes('-pooler')
  ) {
    context.addIssue({
      code: 'custom',
      path: ['DIRECT_DATABASE_URL'],
      message: 'DIRECT_DATABASE_URL must use a non-pooled endpoint',
    })
  }
  if (
    environment.NODE_ENV === 'production' &&
    environment.CORS_ORIGINS.some((origin) => new URL(origin).protocol !== 'https:')
  ) {
    context.addIssue({
      code: 'custom',
      path: ['CORS_ORIGINS'],
      message: 'Production CORS origins must use HTTPS',
    })
  }
})

export type Environment = z.infer<typeof environmentSchema>

export class EnvironmentValidationError extends Error {
  constructor(readonly issues: z.ZodIssue[]) {
    super('Backend environment configuration is invalid')
    this.name = 'EnvironmentValidationError'
  }
}

export function parseEnvironment(input: NodeJS.ProcessEnv | Record<string, string | undefined>): Environment {
  const parsed = environmentSchema.safeParse(input)
  if (!parsed.success) {
    throw new EnvironmentValidationError(parsed.error.issues)
  }
  return parsed.data
}
