import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  BrevoSmsError,
  BrevoSmsProvider,
} from '../modules/farmer-applications/brevo-sms-provider.js'

const providerOptions = {
  apiKey: 'test-key-not-a-real-credential',
  sender: 'MUSHUB',
  timeoutMs: 10000,
}

describe('Brevo transactional SMS provider', () => {
  it('sends the OTP to the Indian E.164 recipient with the approved transactional payload', async () => {
    let requestUrl = ''
    let requestInit: RequestInit | undefined
    const provider = new BrevoSmsProvider({
      ...providerOptions,
      fetchImpl: async (input, init) => {
        requestUrl = String(input)
        requestInit = init
        return new Response(null, { status: 201 })
      },
    })

    await provider.sendOtp('+919876543210', '123456')

    assert.equal(requestUrl, 'https://api.brevo.com/v3/transactionalSMS/send')
    assert.equal(requestInit?.method, 'POST')
    assert.equal(new Headers(requestInit?.headers).get('api-key'), providerOptions.apiKey)
    assert.deepEqual(JSON.parse(String(requestInit?.body)), {
      sender: 'MUSHUB',
      recipient: '919876543210',
      content: 'Your Mushroom Hub verification code is 123456. It expires in 5 minutes. Do not share this code.',
      type: 'transactional',
      tag: 'mushroom_hub_farmer_otp',
      unicodeEnabled: false,
    })
  })

  it('classifies invalid Brevo credentials without exposing provider response details', async () => {
    const provider = new BrevoSmsProvider({
      ...providerOptions,
      fetchImpl: async () => new Response('private provider error', { status: 401 }),
    })

    await assert.rejects(
      provider.sendOtp('+919876543210', '123456'),
      (error: unknown) => {
        assert.ok(error instanceof BrevoSmsError)
        assert.equal(error.failure, 'invalid_credentials')
        assert.equal(error.statusCode, 401)
        assert.doesNotMatch(error.message, /private provider error|test-key/)
        return true
      },
    )
  })

  it('classifies insufficient credits and sender rejection', async () => {
    for (const [body, failure] of [
      ['Insufficient credits', 'insufficient_credits'],
      ['Invalid sender specified', 'sender_rejected'],
    ] as const) {
      const provider = new BrevoSmsProvider({
        ...providerOptions,
        fetchImpl: async () => new Response(body, { status: 400 }),
      })
      await assert.rejects(
        provider.sendOtp('+919876543210', '123456'),
        (error: unknown) => {
          assert.ok(error instanceof BrevoSmsError)
          assert.equal(error.failure, failure)
          assert.doesNotMatch(error.message, new RegExp(body))
          return true
        },
      )
    }
  })

  it('classifies a timed out request', async () => {
    const provider = new BrevoSmsProvider({
      ...providerOptions,
      timeoutMs: 1,
      fetchImpl: async (_input, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
      }),
    })

    await assert.rejects(
      provider.sendOtp('+919876543210', '123456'),
      (error: unknown) => {
        assert.ok(error instanceof BrevoSmsError)
        assert.equal(error.failure, 'request_timeout')
        return true
      },
    )
  })
})
