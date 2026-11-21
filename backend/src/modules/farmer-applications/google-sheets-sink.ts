export type FarmerApplicationSheetRecord = {
  reference: string
  name: string
  email: string
  phone: string
  locality: string
  block: string
  pinCode: string
  district: string
  state: string
  experience: string | null
  cultivationSpace: string | null
  trainingInterest: boolean | null
  submittedAt: string
}

export class GoogleSheetsSink {
  constructor(
    private readonly webAppUrl: string,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async append(record: FarmerApplicationSheetRecord): Promise<void> {
    const response = await this.fetchImpl(this.webAppUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'application', ...record, token: this.token }),
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) throw new Error(`Google Sheets receiver returned ${response.status}`)

    const result = await response.json() as { ok?: boolean }
    if (!result.ok) throw new Error('Google Sheets receiver rejected the application')
  }
}
