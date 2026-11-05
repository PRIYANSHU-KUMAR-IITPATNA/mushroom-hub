import type { EmailProvider } from './email-provider.js'

export type BrevoEmailFailure =
  | 'invalid_credentials'
  | 'sending_limit'
  | 'sender_rejected'
  | 'provider_rejected'
  | 'request_timeout'
  | 'network_error'

export class BrevoEmailError extends Error {
  constructor(
    readonly failure: BrevoEmailFailure,
    readonly statusCode?: number,
  ) {
    super(`Brevo email request failed: ${failure}`)
    this.name = 'BrevoEmailError'
  }
}

type BrevoEmailProviderOptions = {
  apiKey: string
  senderEmail: string
  senderName: string
  timeoutMs: number
  fetchImpl?: typeof fetch
}

function classifyProviderFailure(statusCode: number, responseText: string): BrevoEmailFailure {
  if (statusCode === 401 || statusCode === 403) return 'invalid_credentials'
  const hint = responseText.toLowerCase()
  if (statusCode === 402 || statusCode === 429 || hint.includes('limit') || hint.includes('quota')) {
    return 'sending_limit'
  }
  if (hint.includes('sender')) return 'sender_rejected'
  return 'provider_rejected'
}

export class BrevoEmailProvider implements EmailProvider {
  private readonly fetchImpl: typeof fetch

  constructor(private readonly options: BrevoEmailProviderOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async sendVerificationCode(email: string, code: string): Promise<void> {
    const textContent = [
      'Hello,',
      '',
      'Thank you for your interest in becoming a Mushroom Hub farmer partner.',
      '',
      'Your email verification code is:',
      code,
      '',
      'This code expires in five minutes.',
      '',
      'If you did not request this code, you can ignore this email.',
      '',
      'Regards,',
      'Mushroom Hub Team',
      'Dhanbad, Jharkhand',
    ].join('\n')
    const htmlContent = `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f4f7f2;font-family:Arial,sans-serif;color:#203229">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:28px 12px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#fff;border-radius:12px;padding:32px">
          <tr><td>
            <p style="margin:0 0 8px;color:#527c42;font-size:13px;font-weight:bold;letter-spacing:1px">MUSHROOM HUB</p>
            <h1 style="margin:0 0 20px;font-size:24px">Verify your email</h1>
            <p>Hello,</p>
            <p>Thank you for your interest in becoming a Mushroom Hub farmer partner.</p>
            <p>Your email verification code is:</p>
            <p style="margin:24px 0;padding:16px;background:#f4f7f2;border-radius:8px;text-align:center;font-size:32px;font-weight:bold;letter-spacing:8px">${code}</p>
            <p>This code expires in five minutes.</p>
            <p>If you did not request this code, you can ignore this email.</p>
            <p style="margin-top:28px">Regards,<br>Mushroom Hub Team<br>Dhanbad, Jharkhand</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`

    let response: Response
    try {
      response = await this.fetchImpl('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'api-key': this.options.apiKey,
        },
        body: JSON.stringify({
          sender: { email: this.options.senderEmail, name: this.options.senderName },
          to: [{ email }],
          subject: 'Verify your email – Mushroom Hub',
          htmlContent,
          textContent,
        }),
        signal: AbortSignal.timeout(this.options.timeoutMs),
      })
    } catch (error) {
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new BrevoEmailError('request_timeout')
      }
      throw new BrevoEmailError('network_error')
    }

    if (response.ok) return

    const responseText = await response.text().catch(() => '')
    throw new BrevoEmailError(
      classifyProviderFailure(response.status, responseText),
      response.status,
    )
  }
}
