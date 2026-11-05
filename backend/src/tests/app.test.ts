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

  it('allows credentials only for configured browser origins', async () => {
    const response = await request(app)
      .get('/health')
      .set('Origin', 'http://localhost:5173')
    assert.equal(response.headers['access-control-allow-origin'], 'http://localhost:5173')
    assert.equal(response.headers['access-control-allow-credentials'], 'true')
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

  it('rejects invalid Indian mobile numbers before contacting an SMS provider', async () => {
    const response = await request(app)
      .post('/api/v1/auth/otp/request')
      .send({ phone: '1234567890' })
    assert.equal(response.status, 400)
    assert.equal(response.body.error.code, 'INVALID_PHONE')
  })

  it('reports the missing SMS provider without simulating OTP delivery', async () => {
    const response = await request(app)
      .post('/api/v1/auth/otp/request')
      .send({ phone: '9876543210' })
    assert.equal(response.status, 503)
    assert.equal(response.body.error.code, 'OTP_PROVIDER_UNAVAILABLE')
  })

  it('requires an authenticated applicant session for private application status', async () => {
    const response = await request(app).get('/api/v1/farmer-applications/me')
    assert.equal(response.status, 401)
    assert.equal(response.body.error.code, 'SESSION_REQUIRED')
    assert.equal(response.headers['cache-control'], 'no-store')
  })

  it('requires an authenticated session before serving the admin application queue', async () => {
    const response = await request(app).get('/api/v1/admin/farmer-applications')
    assert.equal(response.status, 401)
    assert.equal(response.body.error.code, 'SESSION_REQUIRED')
  })
})
