import { useEffect, useState, type FormEvent } from 'react'
import Button from '../components/ui/Button'
import Container from '../components/ui/Container'
import Footer from '../components/layout/Footer'
import Header from '../components/layout/Header'
import type { Language, TranslationKey } from '../i18n/translations'
import { translate } from '../i18n/translations'
import {
  OnboardingApiError,
  onboardingApi,
  type AdminFarmerApplication,
  type AdminFarmerApplicationSummary,
  type FarmerApplicationStatus,
} from '../farmer/onboardingApi'

type Props = {
  language: Language
  onLanguageChange: (language: Language) => void
}

type Stage = 'phone' | 'otp' | 'queue' | 'detail'
type ReviewDecision = 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED'

function FarmerApplicationReview({ language, onLanguageChange }: Props) {
  const [stage, setStage] = useState<Stage>('phone')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [challengeId, setChallengeId] = useState('')
  const [csrfToken, setCsrfToken] = useState('')
  const [applications, setApplications] = useState<AdminFarmerApplicationSummary[]>([])
  const [selected, setSelected] = useState<AdminFarmerApplication>()
  const [decision, setDecision] = useState<ReviewDecision>('APPROVED')
  const [internalNote, setInternalNote] = useState('')
  const [applicantMessage, setApplicantMessage] = useState('')
  const [error, setError] = useState<TranslationKey>()
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    let active = true
    onboardingApi.session()
      .then(async (session) => {
        if (!active) return
        setCsrfToken(session.csrfToken)
        const results = await onboardingApi.adminApplications()
        if (!active) return
        setApplications(results)
        setStage('queue')
      })
      .catch((reason: unknown) => {
        if (!active) return
        if (reason instanceof OnboardingApiError && reason.code === 'ADMIN_REQUIRED') {
          setError('adminFarmerNoAccess')
        } else if (
          reason instanceof OnboardingApiError &&
          (reason.code === 'SESSION_REQUIRED' || reason.code === 'SESSION_EXPIRED')
        ) {
          setStage('phone')
        } else {
          setError(apiErrorKey(reason))
        }
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    document.documentElement.lang = language
    document.title = translate(language, 'adminFarmerApplications')
  }, [language])

  async function loadQueue() {
    const results = await onboardingApi.adminApplications()
    setApplications(results)
  }

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(undefined)
    try {
      const result = await onboardingApi.requestOtp(phone)
      setChallengeId(result.challengeId)
      setStage('otp')
    } catch (reason) {
      setError(apiErrorKey(reason))
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(undefined)
    try {
      const session = await onboardingApi.verifyOtp(phone, challengeId, otp)
      setCsrfToken(session.csrfToken)
      await loadQueue()
      setStage('queue')
    } catch (reason) {
      setError(
        reason instanceof OnboardingApiError && reason.code === 'ADMIN_REQUIRED'
          ? 'adminFarmerNoAccess'
          : apiErrorKey(reason),
      )
    }
  }

  async function openApplication(reference: string) {
    setError(undefined)
    setIsLoading(true)
    try {
      setSelected(await onboardingApi.adminApplication(reference))
      setStage('detail')
    } catch (reason) {
      setError(apiErrorKey(reason))
    } finally {
      setIsLoading(false)
    }
  }

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    if (
      !window.confirm(translate(language, 'adminFarmerConfirm'))
    ) return
    setError(undefined)
    setIsSubmitting(true)
    try {
      const result = await onboardingApi.reviewApplication(
        selected.reference,
        {
          status: decision,
          confirm: true,
          internalNote,
          applicantMessage: applicantMessage || undefined,
        },
        csrfToken,
      )
      const updated = await onboardingApi.adminApplication(result.reference)
      setSelected(updated)
      setInternalNote('')
      setApplicantMessage('')
      await loadQueue()
    } catch (reason) {
      setError(apiErrorKey(reason))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function signOut() {
    try {
      await onboardingApi.logout(csrfToken)
      setCsrfToken('')
      setSelected(undefined)
      setStage('phone')
    } catch (reason) {
      setError(apiErrorKey(reason))
    }
  }

  const needsApplicantMessage =
    decision === 'REJECTED' || decision === 'CHANGES_REQUESTED'

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">{translate(language, 'skipToContent')}</a>
      <Header language={language} onLanguageChange={onLanguageChange} isHome={false} />
      <main className="page-section admin-review-page" id="main-content" tabIndex={-1}>
        <Container>
          <div className="admin-review-heading">
            <p className="eyebrow">{translate(language, 'brandName')}</p>
            <h1>{translate(language, 'adminFarmerApplications')}</h1>
          </div>
          {error ? <p className="onboarding-error" role="alert">{translate(language, error)}</p> : null}
          {isLoading ? <p role="status">{translate(language, 'adminFarmerLoading')}</p> : null}

          {(stage === 'phone' || stage === 'otp') && !isLoading ? (
            <section className="admin-review-card">
              <h2>{translate(language, 'adminFarmerLogin')}</h2>
              {stage === 'phone' ? (
                <form className="onboarding-form" onSubmit={requestCode}>
                  <label className="onboarding-field" htmlFor="admin-farmer-phone">
                    <span>{translate(language, 'adminFarmerPhone')}</span>
                    <input
                      autoComplete="tel"
                      id="admin-farmer-phone"
                      inputMode="tel"
                      onChange={(event) => setPhone(event.target.value)}
                      required
                      value={phone}
                    />
                  </label>
                  <Button type="submit">{translate(language, 'adminFarmerRequestCode')}</Button>
                </form>
              ) : (
                <form className="onboarding-form" onSubmit={verifyCode}>
                  <label className="onboarding-field" htmlFor="admin-farmer-otp">
                    <span>{translate(language, 'adminFarmerOtp')}</span>
                    <input
                      autoComplete="one-time-code"
                      id="admin-farmer-otp"
                      inputMode="numeric"
                      maxLength={6}
                      onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))}
                      required
                      value={otp}
                    />
                  </label>
                  <Button type="submit">{translate(language, 'adminFarmerVerify')}</Button>
                </form>
              )}
            </section>
          ) : null}

          {stage === 'queue' ? (
            <section className="admin-review-card" aria-labelledby="admin-review-queue-title">
              <div className="admin-review-card__heading">
                <h2 id="admin-review-queue-title">{translate(language, 'adminFarmerApplications')}</h2>
                <Button onClick={() => void signOut()} variant="secondary">
                  {translate(language, 'adminFarmerLogout')}
                </Button>
              </div>
              {applications.length === 0 ? (
                <p>{translate(language, 'adminFarmerEmpty')}</p>
              ) : (
                <div className="admin-review-list">
                  {applications.map((application) => (
                    <article className="admin-review-list__item" key={application.reference}>
                      <div>
                        <h3>{application.fullName}</h3>
                        <p>{translate(language, 'adminFarmerReference')}: {application.reference}</p>
                        <p>
                          {application.phone} · {application.locality}, {application.district} · {application.pinCode}
                        </p>
                        <p>
                          {translate(language, 'adminFarmerStatus')}: {translate(language, statusLabel(application.status))}
                        </p>
                        <p>
                          {translate(language, 'adminFarmerSubmitted')}: {formatDate(language, application.submittedAt)}
                        </p>
                      </div>
                      <Button onClick={() => void openApplication(application.reference)}>
                        {translate(language, 'adminFarmerInspect')}
                      </Button>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {stage === 'detail' && selected ? (
            <section className="admin-review-card" aria-labelledby="admin-review-detail-title">
              <div className="admin-review-card__heading">
                <h2 id="admin-review-detail-title">{translate(language, 'adminFarmerInspect')}</h2>
                <Button
                  onClick={() => {
                    setStage('queue')
                    setSelected(undefined)
                  }}
                  variant="secondary"
                >
                  {translate(language, 'adminFarmerBack')}
                </Button>
              </div>
              <dl className="admin-review-details">
                <div><dt>{translate(language, 'adminFarmerReference')}</dt><dd>{selected.reference}</dd></div>
                <div><dt>{translate(language, 'adminFarmerName')}</dt><dd>{selected.fullName}</dd></div>
                <div><dt>{translate(language, 'adminFarmerPhoneLabel')}</dt><dd>{selected.phone}</dd></div>
                <div><dt>{translate(language, 'adminFarmerLocality')}</dt><dd>{selected.locality}</dd></div>
                <div><dt>{translate(language, 'adminFarmerDistrict')}</dt><dd>{selected.district}, {selected.state}</dd></div>
                <div><dt>{translate(language, 'adminFarmerPin')}</dt><dd>{selected.pinCode}</dd></div>
                {selected.address ? <div><dt>{translate(language, 'onboardingAddress')}</dt><dd>{selected.address}</dd></div> : null}
                <div><dt>{translate(language, 'onboardingExperience')}</dt><dd>{selected.experience ?? '—'}</dd></div>
                <div><dt>{translate(language, 'onboardingSpace')}</dt><dd>{selected.cultivationSpace ?? '—'}</dd></div>
                <div><dt>{translate(language, 'onboardingTraining')}</dt><dd>{selected.trainingInterest === null ? '—' : selected.trainingInterest ? translate(language, 'onboardingYes') : translate(language, 'onboardingNo')}</dd></div>
              </dl>
              <h3>{translate(language, 'adminFarmerStatus')}: {translate(language, statusLabel(selected.status))}</h3>
              {selected.applicantMessage ? <p>{selected.applicantMessage}</p> : null}
              {selected.experience ? (
                <p>{translate(language, 'onboardingExperience')}: {translate(language, experienceLabel(selected.experience))}</p>
              ) : null}
              {selected.cultivationSpace ? (
                <p>{translate(language, 'onboardingSpace')}: {translate(language, spaceLabel(selected.cultivationSpace))}</p>
              ) : null}
              <ol className="admin-review-history">
                {selected.history.map((item, index) => (
                  <li key={`${item.createdAt}-${index}`}>
                    <strong>{translate(language, statusLabel(item.toStatus))}</strong>
                    {item.internalNote ? <p>{translate(language, 'adminFarmerInternalNote')}: {item.internalNote}</p> : null}
                  </li>
                ))}
              </ol>
              {selected.status === 'PENDING_REVIEW' || selected.status === 'CHANGES_REQUESTED' ? (
                <form className="onboarding-form" onSubmit={submitReview}>
                  <label className="onboarding-field" htmlFor="admin-review-decision">
                    <span>{translate(language, 'adminFarmerStatus')}</span>
                    <select
                      id="admin-review-decision"
                      onChange={(event) => setDecision(event.target.value as ReviewDecision)}
                      value={decision}
                    >
                      <option value="APPROVED">{translate(language, 'adminFarmerApprove')}</option>
                      <option value="REJECTED">{translate(language, 'adminFarmerReject')}</option>
                      <option value="CHANGES_REQUESTED">{translate(language, 'adminFarmerChanges')}</option>
                    </select>
                  </label>
                  <label className="onboarding-field" htmlFor="admin-internal-note">
                    <span>{translate(language, 'adminFarmerInternalNote')}</span>
                    <textarea
                      id="admin-internal-note"
                      maxLength={1000}
                      onChange={(event) => setInternalNote(event.target.value)}
                      required
                      value={internalNote}
                    />
                  </label>
                  {needsApplicantMessage ? (
                    <label className="onboarding-field" htmlFor="admin-applicant-message">
                      <span>{translate(language, 'adminFarmerMessage')}</span>
                      <textarea
                        id="admin-applicant-message"
                        maxLength={1000}
                        onChange={(event) => setApplicantMessage(event.target.value)}
                        required
                        value={applicantMessage}
                      />
                    </label>
                  ) : null}
                  <Button disabled={isSubmitting} type="submit">
                    {isSubmitting
                      ? translate(language, 'onboardingSubmitting')
                      : translate(language, 'adminFarmerSave')}
                  </Button>
                </form>
              ) : null}
            </section>
          ) : null}
        </Container>
      </main>
      <Footer language={language} isHome={false} />
    </div>
  )
}

function statusLabel(status: FarmerApplicationStatus): TranslationKey {
  switch (status) {
    case 'APPROVED':
      return 'onboardingApprovedLabel'
    case 'REJECTED':
      return 'onboardingRejectedLabel'
    case 'CHANGES_REQUESTED':
      return 'onboardingChangesLabel'
    default:
      return 'onboardingPendingLabel'
  }
}

function experienceLabel(experience: NonNullable<AdminFarmerApplication['experience']>): TranslationKey {
  switch (experience) {
    case 'BEGINNER':
      return 'onboardingBeginner'
    case 'SOME_EXPERIENCE':
      return 'onboardingSomeExperience'
    default:
      return 'onboardingExperienced'
  }
}

function spaceLabel(space: NonNullable<AdminFarmerApplication['cultivationSpace']>): TranslationKey {
  switch (space) {
    case 'BALCONY':
      return 'onboardingBalcony'
    case 'ROOM':
      return 'onboardingRoom'
    case 'SHED':
      return 'onboardingShed'
    default:
      return 'onboardingOtherSpace'
  }
}

function formatDate(language: Language, value: string): string {
  return new Intl.DateTimeFormat(language === 'hi' ? 'hi-IN' : 'en-IN', {
    dateStyle: 'medium',
  }).format(new Date(value))
}

function apiErrorKey(error: unknown): TranslationKey {
  if (error instanceof OnboardingApiError && error.code === 'ADMIN_REQUIRED') {
    return 'adminFarmerNoAccess'
  }
  if (error instanceof OnboardingApiError && error.code === 'OTP_PROVIDER_UNAVAILABLE') {
    return 'onboardingOtpUnavailable'
  }
  if (error instanceof OnboardingApiError && error.code === 'OTP_INVALID') {
    return 'onboardingOtpInvalid'
  }
  if (error instanceof OnboardingApiError && error.code === 'OTP_INVALID_OR_EXPIRED') {
    return 'onboardingOtpExpired'
  }
  if (error instanceof OnboardingApiError && error.code === 'OTP_ATTEMPTS_EXCEEDED') {
    return 'onboardingOtpLimit'
  }
  if (error instanceof OnboardingApiError && error.code === 'FARMER_ROLE_NOT_CONFIGURED') {
    return 'adminFarmerRoleMissing'
  }
  if (
    error instanceof OnboardingApiError &&
    (error.code === 'APPLICATION_CHANGED' || error.code === 'INVALID_REVIEW_TRANSITION')
  ) {
    return 'adminFarmerRefresh'
  }
  if (
    error instanceof OnboardingApiError &&
    (error.code === 'SESSION_REQUIRED' || error.code === 'SESSION_EXPIRED')
  ) {
    return 'onboardingSessionExpired'
  }
  return 'onboardingNetworkError'
}

export default FarmerApplicationReview
