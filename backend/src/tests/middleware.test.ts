import assert from 'node:assert/strict'
import express from 'express'
import { describe, it } from 'node:test'
import request from 'supertest'
import { errorHandler } from '../middleware/errors.js'
import { validateBody } from '../middleware/request-validation.js'
import { z } from 'zod'

const validationApp = express()
validationApp.use(express.json())
validationApp.post(
  '/test',
  validateBody(z.object({ name: z.string().min(2) }).strict()),
  (request, response) => {
    response.status(200).json({ data: request.body, error: null })
  },
)
validationApp.get('/unexpected-error', (_request, _response, next) => {
  next(new Error('private diagnostic content'))
})
validationApp.use(errorHandler)

describe('request and error middleware', () => {
  it('rejects invalid request bodies using the shared error format', async () => {
    const response = await request(validationApp)
      .post('/test')
      .send({ name: 'x', unexpected: true })

    assert.equal(response.status, 400)
    assert.equal(response.body.error.code, 'VALIDATION_ERROR')
    assert.ok(Array.isArray(response.body.error.details))
  })

  it('accepts a valid request body', async () => {
    const response = await request(validationApp)
      .post('/test')
      .send({ name: 'Mushroom Hub' })

    assert.equal(response.status, 200)
    assert.equal(response.body.data.name, 'Mushroom Hub')
  })

  it('does not expose unexpected internal error details', async () => {
    const response = await request(validationApp).get('/unexpected-error')

    assert.equal(response.status, 500)
    assert.equal(response.body.error.code, 'INTERNAL_SERVER_ERROR')
    assert.equal(JSON.stringify(response.body).includes('private diagnostic content'), false)
  })
})
