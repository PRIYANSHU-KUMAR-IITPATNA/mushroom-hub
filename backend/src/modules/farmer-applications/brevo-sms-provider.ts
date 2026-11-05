import type { SmsProvider } from './sms-provider.js'

export type BrevoSmsFailure =
  | 'invalid_credentials'
  | 'insufficient_credits'
  | 'sender_rejected'
  | 'request_timeout'
  | 'provider_rejected'
  | 'network_error'

export class BrevoSmsError extends Error {
  constructor(
    readonly failure: BrevoSmsFailure,
    readonly statusCode?: number,
  ) {
    super(`Brevo SMS request failed: ${failure}`)
    this.name = 'BrevoSmsError'
  }
}

type BrevoSmsProviderOptions = {
  apiKey: string
  sender: string
  timeoutMs: number
  fetchImpl?: typeof fetch
}

function classifyProviderFailure(statusCode: number, responseText: string): BrevoSmsFailure {
  if (statusCode === 401 || statusCode === 403) return 'invalid_credentials'
  const responseHint = responseText.toLowerCase()
  if (responseHint.includes('credit')) return 'insufficient_credits'
  if (responseHint.includes('sender')) return 'sender_rejected'
  return 'provider_rejected'
}

export class BrevoSmsProvider implements SmsProvider {
  private readonly fetchImpl: typeof fetch

  constructor(private readonly options: BrevoSmsProviderOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async sendOtp(phoneE164: string, code: string): Promise<void> {
    let response: Response
    try {
      response = await this.fetchImpl('https://api.brevo.com/v3/transactionalSMS/send', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'api-key': this.options.apiKey,
        },
        body: JSON.stringify({
          sender: this.options.sender,
          recipient: phoneE164.replace(/^\+/, ''),
          content: `Your Mushroom Hub verification code is ${code}. It expires in 5 minutes. Do not share this code.`,
          type: 'transactional',
          tag: 'mushroom_hub_farmer_otp',
          unicodeEnabled: false,
        }),
        signal: AbortSignal.timeout(this.options.timeoutMs),
      })
    } catch (error) {
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new BrevoSmsError('request_timeout')
      }
      throw new BrevoSmsError('network_error')
    }

    if (response.ok) return

    const responseText = await response.text().catch(() => '')
    throw new BrevoSmsError(
      classifyProviderFailure(response.status, responseText),
      response.status,
    )
  }
}
