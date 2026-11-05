import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  EnvironmentValidationError,
  parseEnvironment,
} from '../config/env.js'

const validEnvironment = {
  DATABASE_URL: 'postgresql://user:password@ep-example-pooler.neon.tech/app?sslmode=require',
  DIRECT_DATABASE_URL: 'postgresql://user:password@ep-example.neon.tech/app?sslmode=require',
}

describe('environment configuration', () => {
  it('parses valid Neon-style URLs and defaults local settings', () => {
    const environment = parseEnvironment(validEnvironment)
    assert.equal(environment.PORT, 8080)
    assert.equal(environment.NODE_ENV, 'development')
    assert.deepEqual(environment.CORS_ORIGINS, ['http://localhost:5173'])
    assert.equal(environment.BREVO_SMS_ENABLED, false)
    assert.equal(environment.BREVO_SMS_TIMEOUT_MS, 10000)
    assert.equal(environment.BREVO_EMAIL_ENABLED, false)
    assert.equal(environment.BREVO_EMAIL_TIMEOUT_MS, 10000)
  })

  it('accepts comma-separated explicit CORS origins', () => {
    const environment = parseEnvironment({
      ...validEnvironment,
      CORS_ORIGINS: 'https://mushroom.example, https://admin.mushroom.example',
    })
    assert.deepEqual(environment.CORS_ORIGINS, [
      'https://mushroom.example',
      'https://admin.mushroom.example',
    ])
  })

  it('rejects missing database settings without printing their values', () => {
    assert.throws(
      () => parseEnvironment({}),
      (error: unknown) => {
        assert.ok(error instanceof EnvironmentValidationError)
        assert.ok(error.issues.some((issue) => issue.path[0] === 'DATABASE_URL'))
        return true
      },
    )
  })

  it('rejects non-PostgreSQL database URLs', () => {
    assert.throws(
      () => parseEnvironment({
        ...validEnvironment,
        DATABASE_URL: 'https://example.test/database',
      }),
      EnvironmentValidationError,
    )
  })

  it('rejects malformed database URLs as environment validation errors', () => {
    assert.throws(
      () => parseEnvironment({
        ...validEnvironment,
        DATABASE_URL: 'not-a-url',
      }),
      EnvironmentValidationError,
    )
  })

  it('requires a Neon pooler for runtime and a direct migration endpoint', () => {
    assert.throws(
      () => parseEnvironment({
        ...validEnvironment,
        DATABASE_URL: 'postgresql://user:password@ep-example.neon.tech/app?sslmode=require',
      }),
      EnvironmentValidationError,
    )
    assert.throws(
      () => parseEnvironment({
        ...validEnvironment,
        DIRECT_DATABASE_URL: 'postgresql://user:password@ep-example-pooler.neon.tech/app?sslmode=require',
      }),
      EnvironmentValidationError,
    )
  })

  it('rejects wildcard CORS origins', () => {
    assert.throws(
      () => parseEnvironment({ ...validEnvironment, CORS_ORIGINS: '*' }),
      EnvironmentValidationError,
    )
  })

  it('rejects CORS entries that are not exact secure origins', () => {
    assert.throws(
      () => parseEnvironment({
        ...validEnvironment,
        CORS_ORIGINS: 'https://mushroom.example/path',
      }),
      EnvironmentValidationError,
    )
    assert.throws(
      () => parseEnvironment({
        ...validEnvironment,
        CORS_ORIGINS: 'http://mushroom.example',
      }),
      EnvironmentValidationError,
    )
  })

  it('requires HTTPS origins in production', () => {
    assert.throws(
      () => parseEnvironment({
        ...validEnvironment,
        NODE_ENV: 'production',
        CORS_ORIGINS: 'http://localhost:5173',
      }),
      EnvironmentValidationError,
    )
  })

  it('rejects invalid ports', () => {
    assert.throws(
      () => parseEnvironment({ ...validEnvironment, PORT: '70000' }),
      EnvironmentValidationError,
    )
  })

  it('accepts an unset OTP hash secret but rejects weak configured values', () => {
    assert.equal(parseEnvironment({ ...validEnvironment, OTP_HASH_SECRET: '' }).OTP_HASH_SECRET, undefined)
    assert.throws(
      () => parseEnvironment({ ...validEnvironment, OTP_HASH_SECRET: 'too-short' }),
      EnvironmentValidationError,
    )
  })

  it('requires Brevo credentials, an approved sender, and an OTP secret when SMS is enabled', () => {
    assert.throws(
      () => parseEnvironment({ ...validEnvironment, BREVO_SMS_ENABLED: 'true' }),
      (error: unknown) => {
        assert.ok(error instanceof EnvironmentValidationError)
        assert.deepEqual(
          error.issues.map((issue) => issue.path[0]).sort(),
          ['BREVO_API_KEY', 'BREVO_SMS_SENDER', 'OTP_HASH_SECRET'],
        )
        return true
      },
    )
  })

  it('validates Brevo sender shape and request timeout', () => {
    assert.throws(
      () => parseEnvironment({
        ...validEnvironment,
        BREVO_SMS_SENDER: 'invalid sender id',
      }),
      EnvironmentValidationError,
    )
    assert.throws(
      () => parseEnvironment({
        ...validEnvironment,
        BREVO_SMS_TIMEOUT_MS: '500',
      }),
      EnvironmentValidationError,
    )
  })

  it('requires email sender settings and OTP secret independently of SMS configuration', () => {
    assert.throws(
      () => parseEnvironment({
        ...validEnvironment,
        BREVO_EMAIL_ENABLED: 'true',
        BREVO_API_KEY: 'test-key',
      }),
      (error: unknown) => {
        assert.ok(error instanceof EnvironmentValidationError)
        assert.deepEqual(
          error.issues.map((issue) => issue.path[0]).sort(),
          ['BREVO_EMAIL_SENDER', 'BREVO_EMAIL_SENDER_NAME', 'OTP_HASH_SECRET'],
        )
        return true
      },
    )
    const enabled = parseEnvironment({
      ...validEnvironment,
      BREVO_EMAIL_ENABLED: 'true',
      BREVO_API_KEY: 'test-key',
      BREVO_EMAIL_SENDER: 'farmers@example.test',
      BREVO_EMAIL_SENDER_NAME: 'Mushroom Hub',
      OTP_HASH_SECRET: 'a'.repeat(32),
    })
    assert.equal(enabled.BREVO_EMAIL_ENABLED, true)
    assert.equal(enabled.BREVO_SMS_ENABLED, false)
  })
})
