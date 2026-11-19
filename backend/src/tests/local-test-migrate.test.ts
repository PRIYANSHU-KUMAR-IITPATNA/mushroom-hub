import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { runGuardedLocalTestMigrations } from '../scripts/local-test-migrate.js'

const runtimeUrl = 'postgresql://mushroom_hub_test_user:test-only-password-123@localhost:5432/mushroom_hub_test'
const directUrl = 'postgresql://mushroom_hub_test_user:test-only-password-123@127.0.0.1:5432/mushroom_hub_test'

function createBackendFixture(envContents?: string): string {
  const root = mkdtempSync(join(tmpdir(), 'mushroom-hub-migration-runner-test-'))
  if (envContents !== undefined) writeFileSync(join(root, '.env.test'), envContents)
  mkdirSync(join(root, 'node_modules', 'prisma', 'build'), { recursive: true })
  mkdirSync(join(root, 'prisma', 'migrations', '20260101000000_test'), { recursive: true })
  writeFileSync(join(root, 'node_modules', 'prisma', 'build', 'index.js'), '')
  writeFileSync(join(root, 'prisma', 'schema.prisma'), 'datasource db { provider = "postgresql" }')
  writeFileSync(join(root, 'prisma', 'migrations', 'migration_lock.toml'), 'provider = "postgresql"')
  writeFileSync(join(root, 'prisma', 'migrations', '20260101000000_test', 'migration.sql'), '-- offline fixture')
  return root
}

function envContents(databaseUrl = runtimeUrl, directDatabaseUrl = directUrl): string {
  return [
    'NODE_ENV=test',
    `DATABASE_URL="${databaseUrl}"`,
    `DIRECT_DATABASE_URL="${directDatabaseUrl}"`,
    '',
  ].join('\n')
}

describe('guarded local test migration runner', () => {
  it('accepts dedicated local URLs and invokes Prisma with only validated DB configuration', () => {
    const backendRoot = createBackendFixture(envContents())
    let invocation: Parameters<NonNullable<Parameters<typeof runGuardedLocalTestMigrations>[0]['invokePrisma']>>[0] | undefined

    try {
      runGuardedLocalTestMigrations({
        backendRoot,
        systemEnvironment: {
          DATABASE_URL: 'postgresql://remote/production',
          DIRECT_DATABASE_URL: 'postgresql://remote/production',
          NODE_ENV: 'production',
          PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: 'true',
          PATH: 'offline-path',
        },
        invokePrisma(input) {
          invocation = input
          assert.equal(readFileSync(join(input.workingDirectory, '.env'), 'utf8'), '')
          return { status: 0 }
        },
      })

      assert.ok(invocation)
      assert.equal(invocation.environment.DATABASE_URL, runtimeUrl)
      assert.equal(invocation.environment.DIRECT_DATABASE_URL, directUrl)
      assert.equal(invocation.environment.NODE_ENV, 'test')
      assert.equal(invocation.environment.PATH, 'offline-path')
      assert.equal('PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK' in invocation.environment, false)
      assert.equal(invocation.workingDirectory.startsWith(tmpdir()), true)
    } finally {
      rmSync(backendRoot, { recursive: true, force: true })
    }
  })

  const rejectedConfigurations: Array<[string, string | undefined, string | undefined]> = [
    [
      'Neon runtime URLs',
      'postgresql://user:password@ep-example-pooler.neon.tech:5432/mushroom_hub_test',
      directUrl,
    ],
    [
      'Neon direct URLs',
      runtimeUrl,
      'postgresql://user:password@ep-example.neon.tech:5432/mushroom_hub_test',
    ],
    [
      'remote runtime hostnames',
      'postgresql://user:password@localhost.example.com:5432/mushroom_hub_test',
      directUrl,
    ],
    [
      'remote direct hostnames',
      runtimeUrl,
      'postgresql://user:password@db.example.com:5432/mushroom_hub_test',
    ],
    [
      'remote runtime URL host overrides',
      'postgresql://mushroom_hub_test_user:test-only-password-123@localhost:5432/mushroom_hub_test?host=remote.example.com',
      directUrl,
    ],
    [
      'remote direct URL host overrides',
      runtimeUrl,
      'postgresql://mushroom_hub_test_user:test-only-password-123@localhost:5432/mushroom_hub_test?host=remote.example.com',
    ],
    [
      'wrong runtime database names',
      'postgresql://user:password@localhost:5432/production',
      directUrl,
    ],
    [
      'wrong direct database names',
      runtimeUrl,
      'postgresql://user:password@localhost:5432/production',
    ],
    [
      'wrong runtime port',
      'postgresql://mushroom_hub_test_user:test-only-password-123@localhost:5433/mushroom_hub_test',
      directUrl,
    ],
    [
      'wrong direct port',
      runtimeUrl,
      'postgresql://mushroom_hub_test_user:test-only-password-123@127.0.0.1:5433/mushroom_hub_test',
    ],
    [
      'wrong runtime test role',
      'postgresql://other_user:test-only-password-123@localhost:5432/mushroom_hub_test',
      directUrl,
    ],
    [
      'wrong direct test role',
      runtimeUrl,
      'postgresql://other_user:test-only-password-123@localhost:5432/mushroom_hub_test',
    ],
    ['missing direct URL', runtimeUrl, undefined],
    ['malformed runtime URL', 'not-a-url', directUrl],
    ['malformed direct URL', runtimeUrl, 'not-a-url'],
  ]

  for (const [description, databaseUrl, directDatabaseUrl] of rejectedConfigurations) {
    it(`does not launch Prisma for ${description}`, () => {
      const contents = directDatabaseUrl === undefined
        ? `NODE_ENV=test\nDATABASE_URL="${databaseUrl}"\n`
        : envContents(databaseUrl, directDatabaseUrl)
      const backendRoot = createBackendFixture(contents)
      let launched = false

      try {
        assert.throws(() => runGuardedLocalTestMigrations({
          backendRoot,
          invokePrisma() {
            launched = true
            return { status: 0 }
          },
        }))
        assert.equal(launched, false)
      } finally {
        rmSync(backendRoot, { recursive: true, force: true })
      }
    })
  }

  it('does not fall back when backend/.env.test is missing', () => {
    const backendRoot = createBackendFixture()
    let launched = false

    try {
      assert.throws(() => runGuardedLocalTestMigrations({
        backendRoot,
        systemEnvironment: {
          DATABASE_URL: runtimeUrl,
          DIRECT_DATABASE_URL: directUrl,
          NODE_ENV: 'test',
        },
        invokePrisma() {
          launched = true
          return { status: 0 }
        },
      }), /\.env\.test file is missing/)
      assert.equal(launched, false)
    } finally {
      rmSync(backendRoot, { recursive: true, force: true })
    }
  })

  it('does not launch Prisma when NODE_ENV is missing or not test', () => {
    for (const nodeEnv of ['', 'production']) {
      const contents = envContents().replace('NODE_ENV=test\n', nodeEnv ? `NODE_ENV=${nodeEnv}\n` : '')
      const backendRoot = createBackendFixture(contents)
      let launched = false

      try {
        assert.throws(() => runGuardedLocalTestMigrations({
          backendRoot,
          invokePrisma() {
            launched = true
            return { status: 0 }
          },
        }))
        assert.equal(launched, false)
      } finally {
        rmSync(backendRoot, { recursive: true, force: true })
      }
    }
  })
})
