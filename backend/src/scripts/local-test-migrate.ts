import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseDotenv } from 'dotenv'
import { parseEnvironment } from '../config/env.js'

const TEST_DATABASE = 'mushroom_hub_test'
const TEST_ROLE = 'mushroom_hub_test_user'
const APPROVED_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

type PrismaEnvironment = Record<string, string>
type PrismaInvocation = (input: {
  prismaCliPath: string
  schemaPath: string
  workingDirectory: string
  environment: PrismaEnvironment
}) => { status: number | null; error?: Error }

type RunnerOptions = {
  backendRoot: string
  systemEnvironment?: NodeJS.ProcessEnv
  invokePrisma?: PrismaInvocation
}

function readTestEnvironment(envFilePath: string): PrismaEnvironment {
  if (!existsSync(envFilePath)) {
    throw new Error('Required backend/.env.test file is missing')
  }

  const parsed = parseDotenv(readFileSync(envFilePath))
  if (parsed.NODE_ENV !== 'test') {
    throw new Error('backend/.env.test must set NODE_ENV=test')
  }

  const environment = parseEnvironment(parsed)
  const validated: PrismaEnvironment = {
    DATABASE_URL: environment.DATABASE_URL,
    DIRECT_DATABASE_URL: environment.DIRECT_DATABASE_URL,
    NODE_ENV: environment.NODE_ENV,
  }

  const credentials: Array<{ username: string; password: string }> = []
  for (const key of ['DATABASE_URL', 'DIRECT_DATABASE_URL'] as const) {
    const url = new URL(validated[key])
    const database = decodeURIComponent(url.pathname.slice(1))
    const username = decodeURIComponent(url.username)
    const password = decodeURIComponent(url.password)
    credentials.push({ username, password })

    if (
      !APPROVED_HOSTS.has(url.hostname.toLowerCase()) ||
      url.port !== '5432' ||
      url.pathname !== `/${TEST_DATABASE}` ||
      database !== TEST_DATABASE ||
      username !== TEST_ROLE ||
      password.length < 16 ||
      url.search !== '' ||
      url.hash !== ''
    ) {
      throw new Error(`${key} must target ${TEST_ROLE}@localhost:5432/${TEST_DATABASE} without URL overrides`)
    }
  }

  if (
    credentials[0].username !== credentials[1].username ||
    credentials[0].password !== credentials[1].password
  ) {
    throw new Error('DATABASE_URL and DIRECT_DATABASE_URL must use the same test-role credentials')
  }

  return validated
}

function createPrismaEnvironment(
  validated: PrismaEnvironment,
  systemEnvironment: NodeJS.ProcessEnv,
): PrismaEnvironment {
  const environment: PrismaEnvironment = { ...validated }
  const platformKeys = process.platform === 'win32'
    ? ['PATH', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP']
    : ['PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP']

  for (const key of platformKeys) {
    const value = systemEnvironment[key]
    if (value) environment[key] = value
  }

  return environment
}

function invokePrisma(input: Parameters<PrismaInvocation>[0]) {
  const result = spawnSync(
    process.execPath,
    [input.prismaCliPath, 'migrate', 'deploy', '--schema', input.schemaPath],
    {
      cwd: input.workingDirectory,
      env: input.environment,
      encoding: 'utf8',
      timeout: 300_000,
      windowsHide: true,
      stdio: 'ignore',
    },
  )

  return { status: result.status, error: result.error }
}

export function runGuardedLocalTestMigrations(options: RunnerOptions): void {
  const envFilePath = join(options.backendRoot, '.env.test')
  const validated = readTestEnvironment(envFilePath)
  const prismaCliPath = join(options.backendRoot, 'node_modules', 'prisma', 'build', 'index.js')
  const schemaSource = join(options.backendRoot, 'prisma', 'schema.prisma')
  const migrationsSource = join(options.backendRoot, 'prisma', 'migrations')

  if (!existsSync(prismaCliPath) || !existsSync(schemaSource) || !existsSync(migrationsSource)) {
    throw new Error('Prisma CLI, schema, or migration chain is missing')
  }

  const workingDirectory = mkdtempSync(join(tmpdir(), 'mushroom-hub-test-migrate-'))
  try {
    const schemaPath = join(workingDirectory, 'schema.prisma')
    copyFileSync(schemaSource, schemaPath)
    cpSync(migrationsSource, join(workingDirectory, 'migrations'), { recursive: true })
    writeFileSync(join(workingDirectory, '.env'), '')

    const result = (options.invokePrisma ?? invokePrisma)({
      prismaCliPath,
      schemaPath,
      workingDirectory,
      environment: createPrismaEnvironment(validated, options.systemEnvironment ?? process.env),
    })

    if (result.error || result.status !== 0) {
      throw new Error('Prisma migrate deploy failed; subprocess output was suppressed to protect credentials')
    }
  } finally {
    rmSync(workingDirectory, { recursive: true, force: true })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const backendRoot = fileURLToPath(new URL('../..', import.meta.url))
  try {
    runGuardedLocalTestMigrations({ backendRoot })
    console.info('Local test database migrations completed.')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown local migration runner error'
    console.error(`Local test migration refused or failed: ${message}`)
    process.exitCode = 1
  }
}
