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
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  CORS_ORIGINS: corsOriginsSchema,
}).superRefine((environment, context) => {
  const isLoopback = (hostname: string) =>
    ['localhost', '127.0.0.1', '[::1]'].includes(hostname)

  const runtimeUrl = URL.canParse(environment.DATABASE_URL)
    ? new URL(environment.DATABASE_URL)
    : undefined
  const directUrl = URL.canParse(environment.DIRECT_DATABASE_URL)
    ? new URL(environment.DIRECT_DATABASE_URL)
    : undefined

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
