import { useEffect, useRef, useState, type FormEvent } from 'react'
import Button from '../components/ui/Button'
import Container from '../components/ui/Container'
import Footer from '../components/layout/Footer'
import Header from '../components/layout/Header'
import type { Language, TranslationKey } from '../i18n/translations'
import { translate } from '../i18n/translations'
import {
  OnboardingApiError,
  onboardingApi,
  type FarmerApplication,
} from './onboardingApi'

type FarmerForm = {
  fullName: string
  locality: string
  pinCode: string
  district: string
  state: string
  address: string
  preferredLanguage: Language
  experience: '' | 'BEGINNER' | 'SOME_EXPERIENCE' | 'EXPERIENCED'
  cultivationSpace: '' | 'BALCONY' | 'ROOM' | 'SHED' | 'OTHER'
  trainingInterest: '' | 'yes' | 'no'
  consent: boolean
  promotionalConsent: boolean
}

type PageProps = {
  language: Language
  onLanguageChange: (language: Language) => void
  statusOnly?: boolean
  privacyOnly?: boolean
}

type JourneyStage = 'phone' | 'otp' | 'details' | 'status'

const initialForm = (language: Language): FarmerForm => ({
  fullName: '',
  locality: '',
  pinCode: '',
  district: 'Dhanbad',
  state: 'Jharkhand',
  address: '',
  preferredLanguage: language,
  experience: '',
  cultivationSpace: '',
  trainingInterest: '',
  consent: false,
  promotionalConsent: false,
})

const processSteps: { title: TranslationKey; description: TranslationKey }[] = [
  { title: 'onboardingStep1Title', description: 'onboardingStep1Description' },
  { title: 'onboardingStep2Title', description: 'onboardingStep2Description' },
  { title: 'onboardingStep3Title', description: 'onboardingStep3Description' },
  { title: 'onboardingStep4Title', description: 'onboardingStep4Description' },
  { title: 'onboardingStep5Title', description: 'onboardingStep5Description' },
  { title: 'onboardingStep6Title', description: 'onboardingStep6Description' },
]

const faqs: { question: TranslationKey; answer: TranslationKey }[] = [
  { question: 'onboardingFaqExperienceQ', answer: 'onboardingFaqExperienceA' },
  { question: 'onboardingFaqApprovalQ', answer: 'onboardingFaqApprovalA' },
  { question: 'onboardingFaqBagsQ', answer: 'onboardingFaqBagsA' },
  { question: 'onboardingFaqHarvestQ', answer: 'onboardingFaqHarvestA' },
  { question: 'onboardingFaqPaymentQ', answer: 'onboardingFaqPaymentA' },
]

const reviewSteps: TranslationKey[] = [
  'onboardingAfter1',
  'onboardingAfter2',
  'onboardingAfter3',
  'onboardingAfter4',
]

function applicationForm(application?: FarmerApplication): Partial<FarmerForm> {
  if (!application) return {}
  return {
    fullName: application.fullName ?? '',
    locality: application.locality ?? '',
    pinCode: application.pinCode ?? '',
    district: application.district ?? 'Dhanbad',
    state: application.state ?? 'Jharkhand',
    address: application.address ?? '',
    preferredLanguage: application.preferredLanguage,
    experience: application.experience ?? '',
    cultivationSpace: application.cultivationSpace ?? '',
    trainingInterest:
      application.trainingInterest === undefined || application.trainingInterest === null
        ? ''
        : application.trainingInterest ? 'yes' : 'no',
  }
}

function errorKey(error: unknown): TranslationKey {
  if (!(error instanceof OnboardingApiError)) return 'onboardingNetworkError'
  switch (error.code) {
    case 'OTP_PROVIDER_UNAVAILABLE':
    case 'OTP_NOT_CONFIGURED':
      return 'onboardingOtpUnavailable'
    case 'OTP_DELIVERY_FAILED':
      return 'onboardingOtpSendFailed'
    case 'API_NOT_CONFIGURED':
      return 'onboardingApiUnavailable'
    case 'OTP_RESEND_COOLDOWN':
    case 'OTP_RATE_LIMITED':
      return 'onboardingOtpCooldown'
    case 'OTP_ATTEMPTS_EXCEEDED':
      return 'onboardingOtpLimit'
    case 'OTP_INVALID':
      return 'onboardingOtpInvalid'
    case 'OTP_INVALID_OR_EXPIRED':
      return 'onboardingOtpExpired'
    case 'SESSION_REQUIRED':
    case 'SESSION_EXPIRED':
      return 'onboardingSessionExpired'
    case 'APPLICATION_EXISTS':
    case 'IDEMPOTENCY_CONFLICT':
      return 'onboardingDuplicate'
    case 'NETWORK_ERROR':
    case 'SERVER_ERROR':
      return 'onboardingNetworkError'
    default:
      return 'onboardingFormError'
  }
}

function statusKey(status: FarmerApplication['status']): TranslationKey {
  switch (status) {
    case 'APPROVED':
      return 'onboardingApproved'
    case 'REJECTED':
      return 'onboardingRejected'
    case 'CHANGES_REQUESTED':
      return 'onboardingChangesRequested'
    default:
      return 'onboardingPending'
  }
}

function BecomeFarmerPage({
  language,
  onLanguageChange,
  statusOnly = false,
  privacyOnly = false,
}: PageProps) {
  const [stage, setStage] = useState<JourneyStage>('phone')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [challengeId, setChallengeId] = useState('')
  const [csrfToken, setCsrfToken] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const [form, setForm] = useState<FarmerForm>(() => initialForm(language))
  const [application, setApplication] = useState<FarmerApplication>()
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<TranslationKey>()
  const [announcement, setAnnouncement] = useState<TranslationKey>()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const otpRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    onboardingApi.session()
      .then(async (session) => {
        if (!active) return
        setCsrfToken(session.csrfToken)
        const currentApplication = await onboardingApi.application()
        if (!active) return
        setApplication(currentApplication)
        setForm((current) => ({ ...current, ...applicationForm(currentApplication) }))
        setStage('status')
      })
      .catch((reason: unknown) => {
        if (!active) return
        if (
          reason instanceof OnboardingApiError &&
          reason.code === 'APPLICATION_NOT_FOUND'
        ) {
          setStage('details')
          return
        }
        if (
          reason instanceof OnboardingApiError &&
          (reason.code === 'SESSION_REQUIRED' || reason.code === 'SESSION_EXPIRED')
        ) {
          setStage('phone')
          return
        }
        setError(errorKey(reason))
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!cooldown) return
    const timer = window.setTimeout(() => setCooldown((value) => Math.max(value - 1, 0)), 1000)
    return () => window.clearTimeout(timer)
  }, [cooldown])

  useEffect(() => {
    if (stage === 'otp') {
      otpRef.current?.focus()
    } else if (stage === 'details' || stage === 'status') {
      headingRef.current?.focus()
    }
  }, [stage, application])

  useEffect(() => {
    document.documentElement.lang = language
    document.title = privacyOnly
      ? translate(language, 'onboardingPrivacyTitle')
      : translate(language, 'onboardingHeroTitle')
  }, [language, privacyOnly])

  function updateForm<K extends keyof FarmerForm>(field: K, value: FarmerForm[K]) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function sendOtp(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    if (event && !event.currentTarget.reportValidity()) {
      setError('onboardingFormError')
      return
    }
    setError(undefined)
    setIsSending(true)
    try {
      const result = await onboardingApi.requestOtp(phone)
      setChallengeId(result.challengeId)
      setCooldown(result.resendInSeconds)
      setStage('otp')
      setAnnouncement('onboardingOtpSent')
    } catch (reason) {
      setError(errorKey(reason))
    } finally {
      setIsSending(false)
    }
  }

  async function verifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!event.currentTarget.reportValidity()) {
      setError('onboardingFormError')
      return
    }
    setError(undefined)
    setIsVerifying(true)
    try {
      const session = await onboardingApi.verifyOtp(phone, challengeId, otp)
      setCsrfToken(session.csrfToken)
      setStage('details')
      setAnnouncement(undefined)
      try {
        const currentApplication = await onboardingApi.application()
        setApplication(currentApplication)
        setForm((current) => ({ ...current, ...applicationForm(currentApplication) }))
        setStage('status')
      } catch (reason) {
        if (
          !(reason instanceof OnboardingApiError) ||
          reason.code !== 'APPLICATION_NOT_FOUND'
        ) {
          setError(errorKey(reason))
        }
      }
    } catch (reason) {
      setError(errorKey(reason))
    } finally {
      setIsVerifying(false)
    }
  }

  async function submitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!event.currentTarget.reportValidity()) {
      setError('onboardingFormError')
      return
    }
    setError(undefined)
    setIsSubmitting(true)
    const payload = {
      ...form,
      trainingInterest:
        form.trainingInterest === '' ? undefined : form.trainingInterest === 'yes',
      experience: form.experience || undefined,
      cultivationSpace: form.cultivationSpace || undefined,
      address: form.address || undefined,
    }
    try {
      const result = application?.status === 'CHANGES_REQUESTED'
        ? await onboardingApi.updateApplication(payload, csrfToken)
        : await onboardingApi.submitApplication(payload, csrfToken, crypto.randomUUID())
      setApplication(result)
      setStage('status')
      setAnnouncement('onboardingSuccess')
    } catch (reason) {
      if (
        reason instanceof OnboardingApiError &&
        (reason.code === 'APPLICATION_EXISTS' || reason.code === 'IDEMPOTENCY_CONFLICT')
      ) {
        try {
          const currentApplication = await onboardingApi.application()
          setApplication(currentApplication)
          setStage('status')
          setError('onboardingDuplicate')
        } catch {
          setError(errorKey(reason))
        }
      } else {
        setError(errorKey(reason))
        if (
          reason instanceof OnboardingApiError &&
          (reason.code === 'SESSION_REQUIRED' || reason.code === 'SESSION_EXPIRED')
        ) {
          setCsrfToken('')
          setStage('phone')
        }
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  async function signOut() {
    try {
      await onboardingApi.logout(csrfToken)
      setCsrfToken('')
      setApplication(undefined)
      setStage('phone')
      setAnnouncement(undefined)
    } catch (reason) {
      setError(errorKey(reason))
    }
  }

  const applicationStatus = application
    ? translate(language, statusKey(application.status))
    : ''
  const step = stage === 'details' || stage === 'status' ? 2 : 1

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">{translate(language, 'skipToContent')}</a>
      <Header
        language={language}
        onLanguageChange={onLanguageChange}
        isHome={false}
      />
      <main id="main-content" tabIndex={-1}>
        {privacyOnly ? (
          <section className="onboarding-page page-section">
            <Container className="onboarding-narrow">
              <p className="eyebrow">{translate(language, 'brandName')}</p>
              <h1 className="onboarding-title" tabIndex={-1} ref={headingRef}>
                {translate(language, 'onboardingPrivacyTitle')}
              </h1>
              <p>{translate(language, 'onboardingPrivacyBody')}</p>
              <Button href="/become-a-farmer">
                {translate(language, 'onboardingStartRegistration')}
              </Button>
            </Container>
          </section>
        ) : (
          <>
            <section className="onboarding-hero">
              <Container className="onboarding-hero__inner">
                <div>
                  <p className="eyebrow">{translate(language, 'onboardingHeroEyebrow')}</p>
                  <h1 className="onboarding-title">
                    {translate(language, 'onboardingHeroTitle')}
                  </h1>
                  <p className="onboarding-hero__description">
                    {translate(language, 'onboardingHeroDescription')}
                  </p>
                  <p className="onboarding-location">
                    <span aria-hidden="true" className="hero-location__dot" />
                    {translate(language, 'onboardingLocation')}
                  </p>
                  <div className="onboarding-hero__actions">
                    <Button href="#registration">
                      {translate(language, 'onboardingStartRegistration')}
                    </Button>
                    <Button href="/farmer-application" variant="secondary">
                      {translate(language, 'onboardingStatusLink')}
                    </Button>
                  </div>
                </div>
                <aside className="onboarding-model-note">
                  {translate(language, 'onboardingModelNote')}
                </aside>
              </Container>
            </section>

            <section className="page-section onboarding-section" aria-labelledby="onboarding-how-title">
              <Container>
                <h2 className="section-title" id="onboarding-how-title">
                  {translate(language, 'onboardingHowTitle')}
                </h2>
                <ol className="onboarding-process">
                  {processSteps.map(({ title, description }, index) => (
                    <li className="onboarding-process__item" key={title}>
                      <span className="onboarding-process__number" aria-hidden="true">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <h3>{translate(language, title)}</h3>
                      <p>{translate(language, description)}</p>
                    </li>
                  ))}
                </ol>
              </Container>
            </section>

            <section className="onboarding-after" aria-labelledby="onboarding-after-title">
              <Container className="onboarding-narrow">
                <h2 className="section-title" id="onboarding-after-title">
                  {translate(language, 'onboardingAfterTitle')}
                </h2>
                <ol className="onboarding-review-steps">
                  {reviewSteps.map((key) => <li key={key}>{translate(language, key)}</li>)}
                </ol>
              </Container>
            </section>

            <section
              className="page-section onboarding-form-section"
              id="registration"
              aria-labelledby="onboarding-form-title"
            >
              <Container className="onboarding-narrow">
                <div className="onboarding-form-heading">
                  <p className="eyebrow">{translate(language, 'brandName')}</p>
                  <h2 className="section-title" id="onboarding-form-title" ref={headingRef} tabIndex={-1}>
                    {statusOnly
                      ? translate(language, 'onboardingStatusTitle')
                      : translate(language, 'onboardingFormTitle')}
                  </h2>
                  <p>{translate(language, 'onboardingFormIntro')}</p>
                  {stage === 'details' ? (
                    <p className="onboarding-required-note">
                      {translate(language, 'onboardingRequiredNote')}
                    </p>
                  ) : null}
                </div>

                <ol className="onboarding-progress" aria-label={translate(language, 'onboardingFormTitle')}>
                  <li aria-current={step === 1 ? 'step' : undefined}>
                    {translate(language, 'onboardingStepPhone')}
                  </li>
                  <li aria-current={step === 2 ? 'step' : undefined}>
                    {translate(language, 'onboardingStepDetails')}
                  </li>
                </ol>

                {isLoading ? (
                  <p role="status">{translate(language, 'onboardingLoading')}</p>
                ) : null}
                {error ? <p className="onboarding-error" role="alert">{translate(language, error)}</p> : null}
                {announcement ? (
                  <p className="onboarding-success" role="status" aria-live="polite">
                    {translate(language, announcement)}
                  </p>
                ) : null}

                {stage === 'phone' && !isLoading ? (
                  <form className="onboarding-form" noValidate onSubmit={sendOtp}>
                    <label className="onboarding-field" htmlFor="farmer-phone">
                      <span>{translate(language, 'onboardingPhoneLabel')} *</span>
                      <span className="onboarding-phone-input">
                        <span aria-hidden="true">+91</span>
                        <input
                          autoComplete="tel-national"
                          id="farmer-phone"
                          inputMode="numeric"
                          maxLength={10}
                          minLength={10}
                          onChange={(event) => setPhone(event.target.value.replace(/\D/g, ''))}
                          pattern="[6-9][0-9]{9}"
                          required
                          value={phone}
                        />
                      </span>
                    </label>
                    <Button disabled={isSending} type="submit">
                      {isSending
                        ? translate(language, 'onboardingSubmitting')
                        : translate(language, 'onboardingRequestCode')}
                    </Button>
                  </form>
                ) : null}

                {stage === 'otp' && !isLoading ? (
                  <form className="onboarding-form" noValidate onSubmit={verifyOtp}>
                    <p className="onboarding-live" role="status" aria-live="polite">
                      {translate(language, 'onboardingOtpSent')}
                    </p>
                    <label className="onboarding-field" htmlFor="farmer-otp">
                      <span>{translate(language, 'onboardingOtpLabel')} *</span>
                      <input
                        autoComplete="one-time-code"
                        id="farmer-otp"
                        inputMode="numeric"
                        maxLength={6}
                        minLength={6}
                        onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))}
                        pattern="[0-9]{6}"
                        ref={otpRef}
                        required
                        value={otp}
                      />
                    </label>
                    <div className="onboarding-form__actions">
                      <Button disabled={isVerifying} type="submit">
                        {isVerifying
                          ? translate(language, 'onboardingSubmitting')
                          : translate(language, 'onboardingVerifyCode')}
                      </Button>
                      <Button
                        disabled={cooldown > 0 || isSending}
                        onClick={() => void sendOtp()}
                        type="button"
                        variant="secondary"
                      >
                        {cooldown > 0
                          ? `${translate(language, 'onboardingResendCode')} (${cooldown}s)`
                          : translate(language, 'onboardingResendCode')}
                      </Button>
                    </div>
                  </form>
                ) : null}

                {stage === 'details' && !isLoading ? (
                  <form className="onboarding-form" noValidate onSubmit={submitApplication}>
                    <label className="onboarding-field" htmlFor="farmer-name">
                      <span>{translate(language, 'onboardingFullName')} <span aria-label={translate(language, 'onboardingRequired')}>*</span></span>
                      <input
                        autoComplete="name"
                        id="farmer-name"
                        maxLength={120}
                        minLength={2}
                        onChange={(event) => updateForm('fullName', event.target.value)}
                        required
                        value={form.fullName}
                      />
                    </label>
                    <label className="onboarding-field" htmlFor="farmer-locality">
                      <span>{translate(language, 'onboardingLocality')} *</span>
                      <input
                        autoComplete="address-level3"
                        id="farmer-locality"
                        maxLength={160}
                        minLength={2}
                        onChange={(event) => updateForm('locality', event.target.value)}
                        required
                        value={form.locality}
                      />
                    </label>
                    <label className="onboarding-field" htmlFor="farmer-pin">
                      <span>{translate(language, 'onboardingPin')} *</span>
                      <input
                        autoComplete="postal-code"
                        id="farmer-pin"
                        inputMode="numeric"
                        maxLength={6}
                        onChange={(event) => updateForm('pinCode', event.target.value.replace(/\D/g, ''))}
                        pattern="[0-9]{6}"
                        required
                        value={form.pinCode}
                      />
                    </label>
                    <label className="onboarding-field" htmlFor="farmer-district">
                      <span>{translate(language, 'onboardingDistrict')} *</span>
                      <input
                        autoComplete="address-level2"
                        id="farmer-district"
                        maxLength={100}
                        minLength={2}
                        onChange={(event) => updateForm('district', event.target.value)}
                        required
                        value={form.district}
                      />
                    </label>
                    <label className="onboarding-field" htmlFor="farmer-state">
                      <span>{translate(language, 'onboardingState')} *</span>
                      <input
                        autoComplete="address-level1"
                        id="farmer-state"
                        maxLength={100}
                        minLength={2}
                        onChange={(event) => updateForm('state', event.target.value)}
                        required
                        value={form.state}
                      />
                    </label>
                    <label className="onboarding-field" htmlFor="farmer-address">
                      <span>{translate(language, 'onboardingAddress')}</span>
                      <input
                        autoComplete="street-address"
                        id="farmer-address"
                        maxLength={300}
                        onChange={(event) => updateForm('address', event.target.value)}
                        value={form.address}
                      />
                    </label>
                    <label className="onboarding-field" htmlFor="farmer-language">
                      <span>{translate(language, 'onboardingLanguage')}</span>
                      <select
                        id="farmer-language"
                        onChange={(event) => updateForm('preferredLanguage', event.target.value as Language)}
                        value={form.preferredLanguage}
                      >
                        <option value="en">English</option>
                        <option value="hi">हिन्दी</option>
                      </select>
                    </label>
                    <label className="onboarding-field" htmlFor="farmer-experience">
                      <span>{translate(language, 'onboardingExperience')}</span>
                      <select
                        id="farmer-experience"
                        onChange={(event) => updateForm('experience', event.target.value as FarmerForm['experience'])}
                        value={form.experience}
                      >
                        <option value="">{translate(language, 'onboardingChoose')}</option>
                        <option value="BEGINNER">{translate(language, 'onboardingBeginner')}</option>
                        <option value="SOME_EXPERIENCE">{translate(language, 'onboardingSomeExperience')}</option>
                        <option value="EXPERIENCED">{translate(language, 'onboardingExperienced')}</option>
                      </select>
                    </label>
                    <label className="onboarding-field" htmlFor="farmer-space">
                      <span>{translate(language, 'onboardingSpace')}</span>
                      <select
                        id="farmer-space"
                        onChange={(event) => updateForm('cultivationSpace', event.target.value as FarmerForm['cultivationSpace'])}
                        value={form.cultivationSpace}
                      >
                        <option value="">{translate(language, 'onboardingChoose')}</option>
                        <option value="BALCONY">{translate(language, 'onboardingBalcony')}</option>
                        <option value="ROOM">{translate(language, 'onboardingRoom')}</option>
                        <option value="SHED">{translate(language, 'onboardingShed')}</option>
                        <option value="OTHER">{translate(language, 'onboardingOtherSpace')}</option>
                      </select>
                    </label>
                    <label className="onboarding-field" htmlFor="farmer-training">
                      <span>{translate(language, 'onboardingTraining')}</span>
                      <select
                        id="farmer-training"
                        onChange={(event) => updateForm('trainingInterest', event.target.value as FarmerForm['trainingInterest'])}
                        value={form.trainingInterest}
                      >
                        <option value="">{translate(language, 'onboardingChoose')}</option>
                        <option value="yes">{translate(language, 'onboardingYes')}</option>
                        <option value="no">{translate(language, 'onboardingNo')}</option>
                      </select>
                    </label>
                    <label className="onboarding-check" htmlFor="farmer-consent">
                      <input
                        checked={form.consent}
                        id="farmer-consent"
                        onChange={(event) => updateForm('consent', event.target.checked)}
                        required
                        type="checkbox"
                      />
                      <span>
                        {translate(language, 'onboardingConsent')}{' '}
                        <a href="/privacy">{translate(language, 'onboardingPrivacyLink')}</a>
                      </span>
                    </label>
                    <label className="onboarding-check" htmlFor="farmer-promo-consent">
                      <input
                        checked={form.promotionalConsent}
                        id="farmer-promo-consent"
                        onChange={(event) => updateForm('promotionalConsent', event.target.checked)}
                        type="checkbox"
                      />
                      <span>{translate(language, 'onboardingPromoConsent')}</span>
                    </label>
                    <div className="onboarding-form__actions">
                      <Button disabled={isSubmitting || !csrfToken} type="submit">
                        {isSubmitting
                          ? translate(language, 'onboardingSubmitting')
                          : translate(language, 'onboardingSubmit')}
                      </Button>
                      {statusOnly ? (
                        <Button href="/farmer-application" variant="secondary">
                          {translate(language, 'onboardingStatusLink')}
                        </Button>
                      ) : null}
                    </div>
                  </form>
                ) : null}

                {stage === 'status' && application ? (
                  <section className="onboarding-status" aria-labelledby="application-status-title">
                    <h3 id="application-status-title">{translate(language, 'onboardingStatusTitle')}</h3>
                    <p className="onboarding-status__message" role="status" aria-live="polite">
                      {applicationStatus}
                    </p>
                    {(application.status === 'CHANGES_REQUESTED' ||
                      application.status === 'REJECTED') &&
                    application.applicantMessage ? (
                      <p>{application.applicantMessage}</p>
                    ) : null}
                    <dl className="onboarding-status__details">
                      <div>
                        <dt>{translate(language, 'onboardingReference')}</dt>
                        <dd>{application.reference}</dd>
                      </div>
                      <div>
                        <dt>{translate(language, 'onboardingUpdated')}</dt>
                        <dd>
                          {new Intl.DateTimeFormat(language === 'hi' ? 'hi-IN' : 'en-IN', {
                            dateStyle: 'medium',
                          }).format(new Date(application.updatedAt))}
                        </dd>
                      </div>
                    </dl>
                    <Button onClick={() => void signOut()} variant="secondary">
                      {translate(language, 'onboardingLogout')}
                    </Button>
                    {application.status === 'CHANGES_REQUESTED' ? (
                      <form className="onboarding-form" onSubmit={submitApplication}>
                        <p>{translate(language, 'onboardingChangesRequested')}</p>
                        <p>{translate(language, 'onboardingFormTitle')}</p>
                        <Button
                          onClick={() => setStage('details')}
                          type="button"
                        >
                          {translate(language, 'onboardingContinue')}
                        </Button>
                      </form>
                    ) : null}
                    {application.status === 'APPROVED' ? (
                      <Button href="/farmer">
                        {translate(language, 'onboardingApprovedLink')}
                      </Button>
                    ) : null}
                  </section>
                ) : null}
              </Container>
            </section>

            <section className="page-section onboarding-faq" aria-labelledby="onboarding-faq-title">
              <Container className="onboarding-narrow">
                <h2 className="section-title" id="onboarding-faq-title">
                  {translate(language, 'onboardingFaqTitle')}
                </h2>
                {faqs.map(({ question, answer }) => (
                  <details className="onboarding-faq__item" key={question}>
                    <summary>{translate(language, question)}</summary>
                    <p>{translate(language, answer)}</p>
                  </details>
                ))}
              </Container>
            </section>

            <section className="onboarding-help">
              <Container className="onboarding-narrow">
                <h2>{translate(language, 'onboardingHelpTitle')}</h2>
                <p>{translate(language, 'onboardingHelp')}</p>
              </Container>
            </section>
          </>
        )}
      </main>
      <Footer language={language} isHome={false} />
    </div>
  )
}

export default BecomeFarmerPage
