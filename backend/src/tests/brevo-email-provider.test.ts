import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  BrevoEmailError,
  BrevoEmailProvider,
} from '../modules/farmer-applications/brevo-email-provider.js'

const providerOptions = {
  apiKey: 'test-key-not-a-real-credential',
  senderEmail: 'farmers@example.test',
  senderName: 'Mushroom Hub',
  timeoutMs: 10000,
}

describe('Brevo transactional email provider', () => {
  it('sends a branded transactional message with HTML and plain-text content', async () => {
    let requestUrl = ''
    let requestInit: RequestInit | undefined
    const provider = new BrevoEmailProvider({
      ...providerOptions,
      fetchImpl: async (input, init) => {
        requestUrl = String(input)
        requestInit = init
        return new Response(null, { status: 201 })
      },
    })

    await provider.sendVerificationCode('farmer@example.test', '123456')

    assert.equal(requestUrl, 'https://api.brevo.com/v3/smtp/email')
    assert.equal(requestInit?.method, 'POST')
    assert.equal(new Headers(requestInit?.headers).get('api-key'), providerOptions.apiKey)
    const body = JSON.parse(String(requestInit?.body))
    assert.deepEqual(body.sender, {
      email: providerOptions.senderEmail,
      name: providerOptions.senderName,
    })
    assert.deepEqual(body.to, [{ email: 'farmer@example.test' }])
    assert.equal(body.subject, 'Verify your email – Mushroom Hub')
    assert.match(body.htmlContent, /MUSHROOM HUB/)
    assert.match(body.htmlContent, /123456/)
    assert.match(body.textContent, /123456/)
    assert.match(body.textContent, /Dhanbad, Jharkhand/)
  })

  it('classifies invalid Brevo credentials without exposing provider response details', async () => {
    const provider = new BrevoEmailProvider({
      ...providerOptions,
      fetchImpl: async () => new Response('private provider error', { status: 401 }),
    })

    await assert.rejects(provider.sendVerificationCode('farmer@example.test', '123456'), (error: unknown) => {
      assert.ok(error instanceof BrevoEmailError)
      assert.equal(error.failure, 'invalid_credentials')
      assert.doesNotMatch(error.message, /private provider error|test-key|123456/)
      return true
    })
  })

  it('classifies rate limits, sending limits, and sender rejection', async () => {
    for (const [status, responseText, failure] of [
      [429, 'Too many requests', 'sending_limit'],
      [402, 'Insufficient credits', 'sending_limit'],
      [400, 'Sender is not verified', 'sender_rejected'],
    ] as const) {
      const provider = new BrevoEmailProvider({
        ...providerOptions,
        fetchImpl: async () => new Response(responseText, { status }),
      })

      await assert.rejects(
        provider.sendVerificationCode('farmer@example.test', '123456'),
        (error: unknown) => {
          assert.ok(error instanceof BrevoEmailError)
          assert.equal(error.failure, failure)
          assert.equal(error.statusCode, status)
          assert.doesNotMatch(error.message, /Insufficient credits|Sender is not verified|123456/)
          return true
        },
      )
    }
  })

  it('classifies a timed out request', async () => {
    const provider = new BrevoEmailProvider({
      ...providerOptions,
      timeoutMs: 1,
      fetchImpl: async (_input, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
      }),
    })

    await assert.rejects(
      provider.sendVerificationCode('farmer@example.test', '123456'),
      (error: unknown) => {
        assert.ok(error instanceof BrevoEmailError)
        assert.equal(error.failure, 'request_timeout')
        return true
      },
    )
  })
})
