const configuredApiUrl = import.meta.env.VITE_API_BASE_URL

const apiBaseUrl = configuredApiUrl?.replace(/\/+$/, '') || (
  import.meta.env.DEV ? 'http://localhost:8080/api/v1' : undefined
)

export type FarmerApplicationStatus =
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'CHANGES_REQUESTED'

export type FarmerApplication = {
  reference: string
  status: FarmerApplicationStatus
  applicantMessage: string | null
  submittedAt: string
  updatedAt: string
  fullName?: string
  contactPhone?: string
  locality?: string
  block?: string
  pinCode?: string
  district?: string
  state?: string
  address?: string | null
  preferredLanguage?: 'en' | 'hi'
  experience?: 'BEGINNER' | 'SOME_EXPERIENCE' | 'EXPERIENCED' | null
  cultivationSpace?: 'BALCONY' | 'ROOM' | 'SHED' | 'OTHER' | null
  trainingInterest?: boolean | null
}

export type AdminFarmerApplication = FarmerApplication & {
  fullName: string
  email: string | null
  phone: string
  state: string
  district: string
  locality: string
  block: string
  pinCode: string
  address: string | null
  preferredLanguage: 'en' | 'hi'
  experience: 'BEGINNER' | 'SOME_EXPERIENCE' | 'EXPERIENCED' | null
  cultivationSpace: 'BALCONY' | 'ROOM' | 'SHED' | 'OTHER' | null
  trainingInterest: boolean | null
  history: {
    fromStatus: FarmerApplicationStatus | null
    toStatus: FarmerApplicationStatus
    internalNote: string | null
    applicantMessage: string | null
    createdAt: string
  }[]
}

export type AdminFarmerApplicationSummary = Pick<
  FarmerApplication,
  'reference' | 'status' | 'submittedAt'
> & {
  fullName: string
  phone: string
  district: string
  locality: string
  pinCode: string
}

type ApiEnvelope<T> = {
  data: T | null
  error: {
    code: string
    message: string
  } | null
}

export class OnboardingApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code)
    this.name = 'OnboardingApiError'
  }
}

async function request<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH'
    body?: unknown
    csrfToken?: string
    idempotencyKey?: string
  } = {},
): Promise<T> {
  if (!apiBaseUrl) throw new OnboardingApiError('API_NOT_CONFIGURED', 0)

  const headers = new Headers({ Accept: 'application/json' })
  if (options.body !== undefined) headers.set('Content-Type', 'application/json')
  if (options.csrfToken) headers.set('X-CSRF-Token', options.csrfToken)
  if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey)

  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers,
      credentials: 'include',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
  } catch {
    throw new OnboardingApiError('NETWORK_ERROR', 0)
  }

  let envelope: ApiEnvelope<T>
  try {
    envelope = await response.json() as ApiEnvelope<T>
  } catch {
    throw new OnboardingApiError('SERVER_ERROR', response.status)
  }
  if (!response.ok || envelope.error || envelope.data === null) {
    throw new OnboardingApiError(
      envelope.error?.code ?? 'SERVER_ERROR',
      response.status,
    )
  }
  return envelope.data
}

export const onboardingApi = {
  requestOtp(phone: string) {
    return request<{
      challengeId: string
      expiresInSeconds: number
      resendInSeconds: number
      message: string
    }>('/auth/otp/request', { method: 'POST', body: { phone } })
  },
  verifyOtp(phone: string, challengeId: string, code: string) {
    return request<{ csrfToken: string }>('/auth/otp/verify', {
      method: 'POST',
      body: { phone, challengeId, code },
    })
  },
  requestEmailOtp(email: string) {
    return request<{
      challengeId: string
      expiresInSeconds: number
      resendInSeconds: number
      message: string
    }>('/auth/email-otp/request', { method: 'POST', body: { email } })
  },
  verifyEmailOtp(email: string, challengeId: string, code: string) {
    return request<{ csrfToken: string }>('/auth/email-otp/verify', {
      method: 'POST',
      body: { email, challengeId, code },
    })
  },
  session() {
    return request<{ csrfToken: string; email: string | null }>('/auth/session')
  },
  application() {
    return request<FarmerApplication>('/farmer-applications/me')
  },
  submitApplication(
    form: Record<string, unknown>,
    csrfToken: string,
    idempotencyKey: string,
  ) {
    return request<FarmerApplication>('/farmer-applications', {
      method: 'POST',
      body: form,
      csrfToken,
      idempotencyKey,
    })
  },
  updateApplication(form: Record<string, unknown>, csrfToken: string) {
    return request<FarmerApplication>('/farmer-applications/me', {
      method: 'PATCH',
      body: form,
      csrfToken,
    })
  },
  adminApplications() {
    return request<AdminFarmerApplicationSummary[]>('/admin/farmer-applications')
  },
  adminApplication(reference: string) {
    return request<AdminFarmerApplication>(
      `/admin/farmer-applications/${encodeURIComponent(reference)}`,
    )
  },
  reviewApplication(
    reference: string,
    decision: {
      status: FarmerApplicationStatus
      confirm: true
      internalNote: string
      applicantMessage?: string
    },
    csrfToken: string,
  ) {
    return request<FarmerApplication>(
      `/admin/farmer-applications/${encodeURIComponent(reference)}/review`,
      { method: 'PATCH', body: decision, csrfToken },
    )
  },
  logout(csrfToken: string) {
    return request<{ signedOut: boolean }>('/auth/logout', {
      method: 'POST',
      csrfToken,
    })
  },
}
