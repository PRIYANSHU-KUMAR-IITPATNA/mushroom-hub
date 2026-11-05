export interface EmailProvider {
  sendVerificationCode(email: string, code: string): Promise<void>
}
