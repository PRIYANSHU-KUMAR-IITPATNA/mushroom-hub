import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import pino from 'pino'
import request from 'supertest'
import { createApp } from '../app.js'

const app = createApp({
  corsOrigins: ['http://localhost:5173'],
  logger: pino({ enabled: false }),
})

describe('health routes', () => {
  it('returns a liveness response at /health', async () => {
    const response = await request(app).get('/health')
    assert.equal(response.status, 200)
    assert.equal(response.body.data.status, 'ok')
    assert.equal(response.body.error, null)
    assert.ok(response.headers['x-request-id'])
  })

  it('returns a versioned liveness response at /api/v1/health', async () => {
    const response = await request(app).get('/api/v1/health')
    assert.equal(response.status, 200)
    assert.equal(response.body.data.status, 'ok')
    assert.equal(response.body.error, null)
    assert.ok(response.body.meta.requestId)
  })

  it('returns a safe structured 404 response', async () => {
    const response = await request(app).get('/api/v1/not-a-route')
    assert.equal(response.status, 404)
    assert.equal(response.body.error.code, 'NOT_FOUND')
    assert.equal(response.body.error.message, 'The requested resource was not found')
    assert.ok(response.body.error.requestId)
  })

  it('rejects disallowed browser origins without granting CORS access', async () => {
    const response = await request(app)
      .get('/health')
      .set('Origin', 'https://untrusted.example')
    assert.equal(response.status, 200)
    assert.equal(response.headers['access-control-allow-origin'], undefined)
  })

  it('returns a safe client error for malformed JSON', async () => {
    const response = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{')
    assert.equal(response.status, 400)
    assert.equal(response.body.error.code, 'INVALID_JSON')
    assert.equal(response.body.error.message, 'Request body must contain valid JSON')
  })
})
