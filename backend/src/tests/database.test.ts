import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseEnvironment } from '../config/env.js'

describe('database connection configuration', () => {
  it('requires separate PostgreSQL URLs for pooled queries and direct migrations', () => {
    const environment = parseEnvironment({
      DATABASE_URL: 'postgresql://app:secret@ep-pooler.neon.tech/db?sslmode=require&pgbouncer=true',
      DIRECT_DATABASE_URL: 'postgresql://app:secret@ep-direct.neon.tech/db?sslmode=require',
    })

    assert.match(new URL(environment.DATABASE_URL).hostname, /pooler/)
    assert.doesNotMatch(new URL(environment.DIRECT_DATABASE_URL).hostname, /pooler/)
  })

  it('rejects a missing direct migration URL', () => {
    assert.throws(() =>
      parseEnvironment({
        DATABASE_URL: 'postgresql://app:secret@ep-pooler.neon.tech/db?sslmode=require',
      }),
    )
  })
})
