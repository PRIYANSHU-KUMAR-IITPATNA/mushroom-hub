export interface SmsProvider {
  sendOtp(phoneE164: string, code: string): Promise<void>
}
