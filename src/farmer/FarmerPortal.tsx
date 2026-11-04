import { useEffect, useState } from 'react'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Container from '../components/ui/Container'
import LanguageSwitcher from '../components/ui/LanguageSwitcher'
import type { Language } from '../i18n/translations'
import { farmerText, type FarmerTranslationKey } from '../i18n/farmerTranslations'
import {
  clearDemoData,
  createDemoId,
  createEmptyDemoData,
  loadDemoData,
  saveDemoData,
} from './storage'
import type {
  BagOrder,
  FarmerDemoData,
  FarmerProfile,
  HarvestRecord,
  TrainingSession,
} from './types'
import {
  acceptedHarvestOutstanding,
  acceptedHarvestPayments,
  acceptedHarvestValue,
  isAcceptedHarvest,
} from './calculations'

type FarmerPortalProps = {
  language: Language
  onLanguageChange: (language: Language) => void
}

type PortalSection =
  | 'dashboard'
  | 'bags'
  | 'training'
  | 'harvests'
  | 'profile'

type ProfileDraft = Omit<
  FarmerProfile,
  'id' | 'registeredAt' | 'mobileVerified'
>

type ProfileErrors = Partial<Record<keyof ProfileDraft, FarmerTranslationKey>>

import { loadAdminSettings } from '../admin/settings'

const DEMO_SESSIONS: TrainingSession[] = [
  {
    id: 'demo-training-2026-11-14',
    date: '2026-11-14T10:00:00',
    location: 'demoLocationOne',
  },
  {
    id: 'demo-training-2026-11-21',
    date: '2026-11-21T10:00:00',
    location: 'demoLocationTwo',
  },
]

const NAVIGATION: { section: PortalSection; label: FarmerTranslationKey }[] = [
  { section: 'dashboard', label: 'dashboard' },
  { section: 'bags', label: 'buyBags' },
  { section: 'training', label: 'training' },
  { section: 'harvests', label: 'harvestsPayments' },
  { section: 'profile', label: 'profile' },
]

const emptyDraft: ProfileDraft = {
  fullName: '',
  mobile: '',
  state: 'Jharkhand',
  district: '',
  locality: '',
  pinCode: '',
}

function TextField({
  id,
  label,
  value,
  onChange,
  error,
  type = 'text',
  inputMode,
  maxLength,
  autoComplete,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  type?: string
  inputMode?: 'text' | 'numeric' | 'tel'
  maxLength?: number
  autoComplete?: string
}) {
  return (
    <div className="portal-field">
      <label className="portal-field__label" htmlFor={id}>
        {label}
      </label>
      <input
        className={`portal-input${error ? ' portal-input--error' : ''}`}
        id={id}
        name={id}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        maxLength={maxLength}
        value={value}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error && (
        <span className="portal-field__error" id={`${id}-error`} role="alert">
          {error}
        </span>
      )}
    </div>
  )
}

function PortalPageHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string
  title: string
  description?: string
}) {
  return (
    <div className="portal-page-heading">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </div>
  )
}

function formatRupees(amount: number, language: Language): string {
  return new Intl.NumberFormat(language === 'hi' ? 'hi-IN' : 'en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatDate(date: string, language: Language): string {
  const value = new Date(date)
  if (Number.isNaN(value.getTime())) {
    return farmerText(language, 'dateUnavailable')
  }
  return new Intl.DateTimeFormat(language === 'hi' ? 'hi-IN' : 'en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(value)
}

function getAcceptedHarvests(records: HarvestRecord[]): HarvestRecord[] {
  return records.filter(isAcceptedHarvest)
}

function validateProfile(draft: ProfileDraft): ProfileErrors {
  const errors: ProfileErrors = {}
  if (!draft.fullName.trim()) errors.fullName = 'invalidName'
  if (!/^[6-9]\d{9}$/.test(draft.mobile.replace(/\D/g, ''))) {
    errors.mobile = 'invalidMobile'
  }
  if (!draft.state.trim()) errors.state = 'invalidState'
  if (!draft.district.trim()) errors.district = 'invalidDistrict'
  if (!draft.locality.trim()) errors.locality = 'invalidLocality'
  if (!/^\d{6}$/.test(draft.pinCode.trim())) errors.pinCode = 'invalidPinCode'
  return errors
}

function FarmerPortal({ language, onLanguageChange }: FarmerPortalProps) {
  const [initialLoad] = useState(loadDemoData)
  const [data, setData] = useState<FarmerDemoData>(initialLoad.data)
  const [storageWarning, setStorageWarning] = useState(initialLoad.warning)
  const [activeSection, setActiveSection] =
    useState<PortalSection>('dashboard')
  const [registrationStep, setRegistrationStep] = useState<
    'details' | 'otp'
  >('details')
  const [draft, setDraft] = useState<ProfileDraft>(emptyDraft)
  const [profileErrors, setProfileErrors] = useState<ProfileErrors>({})
  const [otp, setOtp] = useState('')
  const [otpError, setOtpError] = useState(false)
  const [pageError, setPageError] = useState<FarmerTranslationKey | null>(null)
  const [notice, setNotice] = useState<FarmerTranslationKey | null>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const [quantity, setQuantity] = useState('1')
  const [fulfillment, setFulfillment] = useState<'pickup' | 'delivery'>(
    'pickup',
  )
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [orderError, setOrderError] =
    useState<FarmerTranslationKey | null>(null)
  const [orderConfirmed, setOrderConfirmed] = useState<BagOrder | null>(null)
  const [editingProfile, setEditingProfile] = useState(false)
  const [profileEditDraft, setProfileEditDraft] =
    useState<ProfileDraft>(emptyDraft)
  const [demoBagPrice, setDemoBagPrice] = useState(
    () => loadAdminSettings().settings.bagUnitPrice,
  )
  const [harvestWeight, setHarvestWeight] = useState('')
  const [harvestError, setHarvestError] = useState(false)

  const t = (key: FarmerTranslationKey) => farmerText(language, key)

  useEffect(() => {
    document.documentElement.lang = language
    document.title = t('portalTitle')
    const description = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    )
    if (description) description.content = t('portalSubtitle')
  }, [language])

  useEffect(() => {
    const syncFromStorage = (event: StorageEvent) => {
      if (event.key === 'mushroom-hub-farmer-demo-v1') {
        const loaded = loadDemoData()
        setData(loaded.data)
        setStorageWarning(loaded.warning)
      }
      if (event.key === 'mushroom-hub-admin-demo-settings-v1') {
        setDemoBagPrice(loadAdminSettings().settings.bagUnitPrice)
      }
    }
    window.addEventListener('storage', syncFromStorage)
    return () => window.removeEventListener('storage', syncFromStorage)
  }, [])

  useEffect(() => {
    if (!resetOpen) return
    document
      .querySelector<HTMLButtonElement>('.portal-dialog [data-reset-cancel]')
      ?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setResetOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [resetOpen])

  const commit = (next: FarmerDemoData, successMessage?: FarmerTranslationKey) => {
    try {
      saveDemoData(next)
      setData(next)
      setPageError(null)
      setStorageWarning(null)
      setNotice(successMessage ?? null)
      return true
    } catch {
      setPageError('saveError')
      return false
    }
  }

  const beginRegistration = () => {
    const errors = validateProfile(draft)
    setProfileErrors(errors)
    setPageError(null)
    setNotice(null)
    if (Object.keys(errors).length === 0) {
      setRegistrationStep('otp')
      setOtp('')
      setOtpError(false)
    }
  }

  const verifyDemoOtp = () => {
    if (otp.trim() !== '123456') {
      setOtpError(true)
      return
    }
    const profile: FarmerProfile = {
      ...draft,
      id: createDemoId(),
      fullName: draft.fullName.trim(),
      mobile: draft.mobile.replace(/\D/g, ''),
      state: draft.state.trim(),
      district: draft.district.trim(),
      locality: draft.locality.trim(),
      pinCode: draft.pinCode.trim(),
      registeredAt: new Date().toISOString(),
      mobileVerified: true,
    }
    const next = { ...createEmptyDemoData(), profile }
    if (commit(next, 'verifiedDemo')) {
      setActiveSection('dashboard')
      setRegistrationStep('details')
    }
  }

  const saveProfile = (profileDraft: ProfileDraft) => {
    const errors = validateProfile(profileDraft)
    setProfileErrors(errors)
    if (Object.keys(errors).length > 0 || !data.profile) return

    const nextProfile: FarmerProfile = {
      ...data.profile,
      ...profileDraft,
      fullName: profileDraft.fullName.trim(),
      mobile: profileDraft.mobile.replace(/\D/g, ''),
      mobileVerified:
        profileDraft.mobile.replace(/\D/g, '') === data.profile.mobile
          ? data.profile.mobileVerified
          : false,
      state: profileDraft.state.trim(),
      district: profileDraft.district.trim(),
      locality: profileDraft.locality.trim(),
      pinCode: profileDraft.pinCode.trim(),
    }
    if (commit({ ...data, profile: nextProfile }, 'profileSaved')) {
      setEditingProfile(false)
    }
  }

  const placeOrder = () => {
    const parsedQuantity = Number(quantity)
    if (
      !Number.isInteger(parsedQuantity) ||
      parsedQuantity < 1 ||
      parsedQuantity > 20
    ) {
      setOrderError('invalidQuantity')
      return
    }
    if (fulfillment === 'delivery' && !deliveryAddress.trim()) {
      setOrderError('invalidDelivery')
      return
    }

    const order: BagOrder = {
      id: createDemoId(),
      productId: 'demo-oyster-grow-bag',
      quantity: parsedQuantity,
      fulfillment,
      deliveryAddress:
        fulfillment === 'delivery' ? deliveryAddress.trim() : null,
      unitPrice: demoBagPrice,
      subtotal: parsedQuantity * demoBagPrice,
      status: 'placed',
      createdAt: new Date().toISOString(),
    }
    if (commit({ ...data, bagOrders: [order, ...data.bagOrders] })) {
      setOrderConfirmed(order)
      setOrderError(null)
      setQuantity('1')
      setDeliveryAddress('')
    }
  }

  const registerForTraining = (sessionId: string) => {
    if (
      data.trainingRegistrations.some(
        (registration) => registration.sessionId === sessionId,
      )
    ) {
      return
    }
    const nextRegistration = {
      id: createDemoId(),
      sessionId,
      registeredAt: new Date().toISOString(),
      status: 'registered' as const,
    }
    commit(
      {
        ...data,
        trainingRegistrations: [
          ...data.trainingRegistrations,
          nextRegistration,
        ],
      },
      'sessionRegistered',
    )
  }

  const submitHarvestRequest = () => {
    const weight = Number(harvestWeight)
    if (!Number.isFinite(weight) || weight <= 0 || weight > 10000) {
      setHarvestError(true)
      return
    }
    const submittedAt = new Date().toISOString()
    const record: HarvestRecord = {
      id: createDemoId(),
      submittedAt,
      status: 'submitted',
      submittedWeightKg: weight,
      acceptedAt: null,
      acceptedWeightKg: null,
      grade: null,
      ratePerKg: null,
      auditTrail: [
        {
          id: createDemoId(),
          action: 'submitted',
          at: submittedAt,
          previousStatus: 'new',
          newStatus: 'submitted',
          note: null,
        },
      ],
    }
    if (commit(
      { ...data, harvestRecords: [record, ...data.harvestRecords] },
      'harvestRequestSaved',
    )) {
      setHarvestWeight('')
      setHarvestError(false)
    }
  }

  const resetDemo = () => {
    try {
      const empty = clearDemoData()
      setData(empty)
      setActiveSection('dashboard')
      setRegistrationStep('details')
      setDraft(emptyDraft)
      setProfileEditDraft(emptyDraft)
      setProfileErrors({})
      setEditingProfile(false)
      setOtp('')
      setOtpError(false)
      setQuantity('1')
      setFulfillment('pickup')
      setDeliveryAddress('')
      setOrderError(null)
      setOrderConfirmed(null)
      setHarvestWeight('')
      setHarvestError(false)
      setStorageWarning(null)
      setPageError(null)
      setNotice(null)
      setResetOpen(false)
    } catch {
      setPageError('saveError')
      setResetOpen(false)
    }
  }

  const acceptedHarvests = getAcceptedHarvests(data.harvestRecords)
  const totalAcceptedKg = acceptedHarvests.reduce(
    (sum, record) => sum + (record.acceptedWeightKg ?? 0),
    0,
  )
  const grossEarnings = acceptedHarvests.reduce(
    (sum, record) => sum + acceptedHarvestValue(record),
    0,
  )
  const totalPaid = acceptedHarvests.reduce(
    (sum, record) => sum + acceptedHarvestPayments(record, data.payments),
    0,
  )
  const outstanding = acceptedHarvests.reduce(
    (sum, record) => sum + acceptedHarvestOutstanding(record, data.payments),
    0,
  )
  const numberText = (key: FarmerTranslationKey, amount: number) =>
    t(key).replace('{amount}', new Intl.NumberFormat(
      language === 'hi' ? 'hi-IN' : 'en-IN',
      { maximumFractionDigits: 2 },
    ).format(amount))

  const renderProfileFields = (
    profileDraft: ProfileDraft,
    update: (draft: ProfileDraft) => void,
    prefix: string,
  ) => {
    const fields: {
      key: keyof ProfileDraft
      label: FarmerTranslationKey
      autoComplete?: string
      inputMode?: 'text' | 'numeric' | 'tel'
      maxLength?: number
    }[] = [
      { key: 'fullName', label: 'fullName', autoComplete: 'name' },
      {
        key: 'mobile',
        label: 'mobile',
        inputMode: 'tel',
        maxLength: 10,
        autoComplete: 'tel-national',
      },
      { key: 'state', label: 'state', autoComplete: 'address-level1' },
      { key: 'district', label: 'district', autoComplete: 'address-level2' },
      { key: 'locality', label: 'locality', autoComplete: 'address-level3' },
      {
        key: 'pinCode',
        label: 'pinCode',
        inputMode: 'numeric',
        maxLength: 6,
        autoComplete: 'postal-code',
      },
    ]
    return (
      <div className="portal-form-grid">
        {fields.map((field) => (
          <TextField
            key={field.key}
            id={`${prefix}-${field.key}`}
            label={t(field.label)}
            value={profileDraft[field.key]}
            inputMode={field.inputMode}
            maxLength={field.maxLength}
            autoComplete={field.autoComplete}
            error={
              profileErrors[field.key]
                ? t(profileErrors[field.key] ?? 'invalidName')
                : undefined
            }
            onChange={(value) => {
              update({ ...profileDraft, [field.key]: value })
              setProfileErrors((current) => ({
                ...current,
                [field.key]: undefined,
              }))
            }}
          />
        ))}
      </div>
    )
  }

  const renderRegistration = () => (
    <main className="portal-main portal-registration" id="main-content">
      <Container className="portal-narrow">
        <PortalPageHeading
          eyebrow={t('demoBanner')}
          title={t(
            registrationStep === 'details'
              ? 'registrationTitle'
              : 'otpTitle',
          )}
          description={t(
            registrationStep === 'details'
              ? 'registrationIntro'
              : 'otpIntro',
          )}
        />
        <Card className="portal-card">
          {registrationStep === 'details' ? (
            <form
              className="portal-form"
              noValidate
              onSubmit={(event) => {
                event.preventDefault()
                beginRegistration()
              }}
            >
              {renderProfileFields(
                draft,
                setDraft,
                'registration',
              )}
              <Button type="submit">{t('continueVerification')}</Button>
            </form>
          ) : (
            <form
              className="portal-form"
              noValidate
              onSubmit={(event) => {
                event.preventDefault()
                verifyDemoOtp()
              }}
            >
              <p className="portal-hint">{t('otpHint')}</p>
              <TextField
                id="demo-otp"
                label={t('demoOtp')}
                value={otp}
                inputMode="numeric"
                maxLength={6}
                error={otpError ? t('invalidOtp') : undefined}
                onChange={(value) => {
                  setOtp(value.replace(/\D/g, ''))
                  setOtpError(false)
                }}
              />
              <div className="portal-form__actions">
                <Button type="submit">{t('verifyAndContinue')}</Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setRegistrationStep('details')
                    setOtpError(false)
                  }}
                >
                  {t('backToRegistration')}
                </Button>
              </div>
            </form>
          )}
        </Card>
      </Container>
    </main>
  )

  const renderDashboard = () => {
    const recentOrders = [...data.bagOrders]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 3)
    const recentHarvests = [...data.harvestRecords]
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
      .slice(0, 3)
    const nextTraining = data.trainingRegistrations
      .map((registration) => ({
        registration,
        session: DEMO_SESSIONS.find(
          (session) => session.id === registration.sessionId,
        ),
      }))
      .find(({ session }) => session)

    return (
      <>
        <div className="portal-page-heading">
          <p className="eyebrow">{t('dashboard')}</p>
          <h1>{farmerText(language, 'welcome', { name: data.profile?.fullName ?? '' })}</h1>
          <p>{t('dashboardIntro')}</p>
        </div>
        <div className="portal-stat-grid">
          <Card className="portal-stat">
            <span>{t('bagOrdersPlaced')}</span>
            <strong>{data.bagOrders.length}</strong>
          </Card>
          <Card className="portal-stat">
            <span>{t('acceptedHarvest')}</span>
            <strong>{numberText('kilograms', totalAcceptedKg)}</strong>
          </Card>
          <Card className="portal-stat">
            <span>{t('estimatedEarnings')}</span>
            <strong>{formatRupees(grossEarnings, language)}</strong>
          </Card>
          <Card className="portal-stat">
            <span>{t('amountPaid')}</span>
            <strong>{formatRupees(totalPaid, language)}</strong>
          </Card>
          <Card className="portal-stat">
            <span>{t('outstandingBalance')}</span>
            <strong>{formatRupees(outstanding, language)}</strong>
          </Card>
        </div>
        <div className="portal-dashboard-grid">
          <Card className="portal-card">
            <div className="portal-card__heading">
              <h2>{t('recentOrders')}</h2>
              <button
                className="portal-inline-link"
                type="button"
                onClick={() => setActiveSection('bags')}
              >
                {t('seeAll')}
              </button>
            </div>
            {recentOrders.length ? (
              <OrderList
                orders={recentOrders}
                language={language}
                t={t}
                formatRupees={formatRupees}
                formatDate={formatDate}
              />
            ) : (
              <p className="portal-empty">{t('noOrders')}</p>
            )}
          </Card>
          <Card className="portal-card">
            <div className="portal-card__heading">
              <h2>{t('training')}</h2>
              <button
                className="portal-inline-link"
                type="button"
                onClick={() => setActiveSection('training')}
              >
                {t('seeAll')}
              </button>
            </div>
            {nextTraining?.session ? (
              <div className="portal-upcoming">
                <strong>{t('trainingUpcoming')}</strong>
                <span>{formatDate(nextTraining.session.date, language)}</span>
                <span>{t(nextTraining.session.location)}</span>
              </div>
            ) : (
              <p className="portal-empty">{t('noTraining')}</p>
            )}
          </Card>
          <Card className="portal-card portal-card--wide">
            <div className="portal-card__heading">
              <h2>{t('recentHarvests')}</h2>
              <button
                className="portal-inline-link"
                type="button"
                onClick={() => setActiveSection('harvests')}
              >
                {t('seeAll')}
              </button>
            </div>
            {recentHarvests.length ? (
              <HarvestList
                records={recentHarvests}
                payments={data.payments}
                language={language}
                t={t}
                formatDate={formatDate}
                formatRupees={formatRupees}
                numberText={numberText}
              />
            ) : (
              <p className="portal-empty">{t('noHarvests')}</p>
            )}
          </Card>
        </div>
        {data.bagOrders.length === 0 &&
          data.trainingRegistrations.length === 0 && (
            <p className="portal-empty portal-empty--callout">
              {t('dashboardEmpty')}
            </p>
          )}
      </>
    )
  }

  const renderBagOrders = () => (
    <>
      <PortalPageHeading
        eyebrow={t('demoCatalog')}
        title={t('buyBags')}
        description={t('demoProductNotice')}
      />
      {orderConfirmed && (
        <div className="portal-success" role="status" aria-live="polite">
          <strong>{t('orderPlaced')}</strong>
          <span>
            {farmerText(language, 'quantityLabel', {
              count: orderConfirmed.quantity,
            })}
            {' · '}
            {formatRupees(orderConfirmed.subtotal, language)}
          </span>
          <span>
            {t('orderFulfillment')}
            {': '}
            {t(
              orderConfirmed.fulfillment === 'pickup'
                ? 'pickupStatus'
                : 'deliveryStatus',
            )}
          </span>
          <span>{t('orderSaved')}</span>
        </div>
      )}
      <div className="portal-shop-grid">
        <Card className="portal-card portal-product">
          <span className="portal-demo-tag">{t('demoCatalog')}</span>
          <h2>{t('productName')}</h2>
          <p>{t('productDescription')}</p>
          <p className="portal-product__price">
            <span>{t('pricePerBag')}</span>
            <strong>{formatRupees(demoBagPrice, language)}</strong>
          </p>
          <form
            className="portal-form"
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              placeOrder()
            }}
          >
            <TextField
              id="bag-quantity"
              label={t('quantity')}
              value={quantity}
              inputMode="numeric"
              onChange={(value) => {
                setQuantity(value.replace(/\D/g, ''))
                setOrderError(null)
              }}
              error={
                orderError === 'invalidQuantity'
                  ? t('invalidQuantity')
                  : undefined
              }
            />
            <fieldset className="portal-fieldset">
              <legend>{t('fulfillment')}</legend>
              <label className="portal-choice">
                <input
                  type="radio"
                  name="fulfillment"
                  value="pickup"
                  checked={fulfillment === 'pickup'}
                  onChange={() => setFulfillment('pickup')}
                />
                <span>{t('pickup')}</span>
              </label>
              <label className="portal-choice">
                <input
                  type="radio"
                  name="fulfillment"
                  value="delivery"
                  checked={fulfillment === 'delivery'}
                  onChange={() => {
                    setFulfillment('delivery')
                    setOrderError(null)
                  }}
                />
                <span>{t('delivery')}</span>
              </label>
            </fieldset>
            <p className="portal-hint">
              {t(fulfillment === 'pickup' ? 'pickupNote' : 'deliveryNote')}
            </p>
            {fulfillment === 'delivery' && (
              <TextField
                id="delivery-address"
                label={t('deliveryAddress')}
                value={deliveryAddress}
                onChange={(value) => {
                  setDeliveryAddress(value)
                  setOrderError(null)
                }}
                error={
                  orderError === 'invalidDelivery'
                    ? t('invalidDelivery')
                    : undefined
                }
              />
            )}
            <p className="portal-subtotal">
              <span>{t('subtotal')}</span>
              <strong>
                {formatRupees(
                  Math.max(0, Number(quantity) || 0) * demoBagPrice,
                  language,
                )}
              </strong>
            </p>
            {orderError && (
              <p className="portal-form-error" role="alert">
                {t(orderError)}
              </p>
            )}
            <Button type="submit">{t('placeDemoOrder')}</Button>
          </form>
        </Card>
        <Card className="portal-card portal-order-history">
          <h2>{t('orderHistory')}</h2>
          {data.bagOrders.length ? (
            <OrderList
              orders={[...data.bagOrders].sort((a, b) =>
                b.createdAt.localeCompare(a.createdAt),
              )}
              language={language}
              t={t}
              formatRupees={formatRupees}
              formatDate={formatDate}
            />
          ) : (
            <p className="portal-empty">{t('noOrders')}</p>
          )}
        </Card>
      </div>
    </>
  )

  const renderTraining = () => (
    <>
      <PortalPageHeading
        eyebrow={t('freeTraining')}
        title={t('training')}
        description={t('trainingIntro')}
      />
      {notice && (
        <p className="portal-success" role="status" aria-live="polite">
          {t(notice)}
        </p>
      )}
      <div className="portal-training-grid">
        {DEMO_SESSIONS.map((session) => {
          const registration = data.trainingRegistrations.find(
            (item) => item.sessionId === session.id,
          )
          return (
            <Card className="portal-card portal-session" key={session.id}>
              <span className="portal-demo-tag">{t('demoSession')}</span>
              <h2>{t('freeTraining')}</h2>
              <dl className="portal-detail-list">
                <div>
                  <dt>{t('sessionDate')}</dt>
                  <dd>{formatDate(session.date, language)}</dd>
                </div>
                <div>
                  <dt>{t('sessionLocation')}</dt>
                  <dd>{t(session.location)}</dd>
                </div>
                <div>
                  <dt>{t('sessionStatus')}</dt>
                  <dd>
                    {registration
                      ? t('registeredStatus')
                      : t('demoSession')}
                  </dd>
                </div>
              </dl>
              <Button
                disabled={Boolean(registration)}
                variant={registration ? 'secondary' : 'primary'}
                onClick={() => registerForTraining(session.id)}
              >
                {registration
                  ? t('sessionRegistered')
                  : t('registerSession')}
              </Button>
            </Card>
          )
        })}
      </div>
    </>
  )

  const renderHarvests = () => (
    <>
      <PortalPageHeading
        title={t('harvestsPayments')}
        description={t('historyIntro')}
      />
      <p className="portal-hint portal-hint--prominent">
        {t('noEditableGrading')}
      </p>
      {notice === 'harvestRequestSaved' && (
        <p className="portal-success" role="status">{t(notice)}</p>
      )}
      <Card className="portal-card portal-harvest-request">
        <h2>{t('reportHarvest')}</h2>
        <p>{t('harvestRequestIntro')}</p>
        <div className="portal-field">
          <label className="portal-field__label" htmlFor="harvest-request-weight">
            {t('submittedWeight')}
          </label>
          <input
            className={`portal-input${harvestError ? ' portal-input--error' : ''}`}
            id="harvest-request-weight"
            type="number"
            min="0.1"
            max="10000"
            step="0.1"
            value={harvestWeight}
            onChange={(event) => {
              setHarvestWeight(event.target.value)
              setHarvestError(false)
            }}
            aria-invalid={harvestError}
            aria-describedby={harvestError ? 'harvest-request-error' : undefined}
          />
          {harvestError && (
            <span className="portal-field__error" id="harvest-request-error" role="alert">
              {t('invalidHarvestWeight')}
            </span>
          )}
        </div>
        <Button onClick={submitHarvestRequest}>{t('submitHarvest')}</Button>
      </Card>
      {data.harvestRecords.length ? (
        <HarvestList
          records={[...data.harvestRecords].sort((a, b) =>
            b.submittedAt.localeCompare(a.submittedAt),
          )}
          payments={data.payments}
          language={language}
          t={t}
          formatDate={formatDate}
          formatRupees={formatRupees}
          numberText={numberText}
        />
      ) : (
        <Card className="portal-card portal-empty-card">
          <h2>{t('harvestsPayments')}</h2>
          <p>{t('noHarvestHistory')}</p>
        </Card>
      )}
    </>
  )

  const renderProfile = () => {
    if (!data.profile) return null
    const profileDraft: ProfileDraft = {
      fullName: data.profile.fullName,
      mobile: data.profile.mobile,
      state: data.profile.state,
      district: data.profile.district,
      locality: data.profile.locality,
      pinCode: data.profile.pinCode,
    }
    return (
      <>
        <PortalPageHeading title={t('profile')} description={t('profileIntro')} />
        <Card className="portal-card portal-profile-card">
          {editingProfile ? (
            <form
              className="portal-form"
              noValidate
              onSubmit={(event) => {
                event.preventDefault()
                saveProfile(profileEditDraft)
              }}
            >
              {renderProfileFields(
                profileEditDraft,
                setProfileEditDraft,
                'edit',
              )}
              <div className="portal-form__actions">
                <Button type="submit">{t('saveProfile')}</Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setEditingProfile(false)
                    setProfileEditDraft(profileDraft)
                    setProfileErrors({})
                  }}
                >
                  {t('cancel')}
                </Button>
              </div>
            </form>
          ) : (
            <>
              <dl className="portal-profile-list">
                {(
                  [
                    ['fullName', data.profile.fullName],
                    ['mobile', data.profile.mobile],
                    ['state', data.profile.state],
                    ['district', data.profile.district],
                    ['locality', data.profile.locality],
                    ['pinCode', data.profile.pinCode],
                  ] as [FarmerTranslationKey, string][]
                ).map(([label, value]) => (
                  <div key={label}>
                    <dt>{t(label)}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
                <div>
                  <dt>{t('mobile')}</dt>
                  <dd>
                    {t(
                      data.profile.mobileVerified
                        ? 'verifiedDemo'
                        : 'notVerified',
                    )}
                  </dd>
                </div>
              </dl>
              <Button
                onClick={() => {
                  setProfileErrors({})
                  setProfileEditDraft(profileDraft)
                  setEditingProfile(true)
                }}
              >
                {t('editProfile')}
              </Button>
            </>
          )}
        </Card>
      </>
    )
  }

  const content = () => {
    switch (activeSection) {
      case 'dashboard':
        return renderDashboard()
      case 'bags':
        return renderBagOrders()
      case 'training':
        return renderTraining()
      case 'harvests':
        return renderHarvests()
      case 'profile':
        return renderProfile()
    }
  }

  const renderResetDialog = () => (
    <div className="portal-dialog-backdrop">
      <section
        className="portal-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="reset-dialog-title"
        aria-describedby="reset-dialog-description"
      >
        <h2 id="reset-dialog-title">{t('confirmResetTitle')}</h2>
        <p id="reset-dialog-description">{t('confirmResetBody')}</p>
        <div className="portal-form__actions">
          <Button
            data-reset-cancel=""
            variant="secondary"
            onClick={() => setResetOpen(false)}
          >
            {t('cancel')}
          </Button>
          <Button onClick={resetDemo}>{t('confirmReset')}</Button>
        </div>
      </section>
    </div>
  )

  return (
    <div className="app-shell farmer-portal">
      <a className="skip-link" href="#main-content">
        {t('skipToContent')}
      </a>
      <header className="portal-header">
        <Container className="portal-header__inner">
          <div className="portal-header__brand">
            <a className="brand" href="/">
              <span className="brand__mark" aria-hidden="true">M</span>
              <span className="brand__text">
                <span className="brand__name">{t('brandName')}</span>
                <span className="brand__descriptor">{t('portalSubtitle')}</span>
              </span>
            </a>
            <a className="portal-home-link" href="/">
              {t('returnHome')}
            </a>
          </div>
          <div className="portal-header__tools">
            <LanguageSwitcher
              language={language}
              onLanguageChange={onLanguageChange}
            />
            {data.profile && (
              <Button
                variant="secondary"
                onClick={() => setResetOpen(true)}
              >
                {t('resetDemo')}
              </Button>
            )}
          </div>
        </Container>
      </header>
      <div className="portal-demo-banner" role="note">
        <Container>{t('demoBanner')}</Container>
      </div>
      {storageWarning && (
        <Container>
          <p className="portal-warning" role="alert">
            {t(
              storageWarning === 'invalid'
                ? 'invalidStoredData'
                : 'localStorageWarning',
            )}
          </p>
        </Container>
      )}
      <Container>
        <p className="portal-storage-notice">{t('storageNotice')}</p>
      </Container>
      {pageError && (
        <Container>
          <p className="portal-warning" role="alert">
            {t(pageError)}
          </p>
        </Container>
      )}
      {notice && data.profile && activeSection !== 'training' && (
        <Container>
          <p className="portal-success" role="status" aria-live="polite">
            {t(notice)}
          </p>
        </Container>
      )}
      {data.profile ? (
        <>
          <nav className="portal-nav" aria-label={t('sectionFor')}>
            <Container className="portal-nav__inner">
              {NAVIGATION.map(({ section, label }) => (
                <button
                  className="portal-nav__link"
                  key={section}
                  type="button"
                  aria-current={activeSection === section ? 'page' : undefined}
                  onClick={() => {
                    setActiveSection(section)
                    setNotice(null)
                    setPageError(null)
                    setOrderConfirmed(null)
                  }}
                >
                  {t(label)}
                </button>
              ))}
            </Container>
          </nav>
          <main className="portal-main" id="main-content">
            <Container className="portal-content">
              {content()}
            </Container>
          </main>
        </>
      ) : (
        renderRegistration()
      )}
      <footer className="portal-footer">
        <Container className="portal-footer__inner">
          <span>{t('portalTitle')} · {t('footerDescriptor')}</span>
          <span>{t('storageNotice')}</span>
        </Container>
      </footer>
      {resetOpen && renderResetDialog()}
    </div>
  )
}

function OrderList({
  orders,
  language,
  t,
  formatRupees,
  formatDate,
}: {
  orders: BagOrder[]
  language: Language
  t: (key: FarmerTranslationKey) => string
  formatRupees: (amount: number, language: Language) => string
  formatDate: (date: string, language: Language) => string
}) {
  return (
    <ul className="portal-record-list">
      {orders.map((order) => (
        <li className="portal-record" key={order.id}>
          <div className="portal-record__main">
            <strong>{t('productName')}</strong>
            <span>
              {formatDate(order.createdAt, language)}
              {' · '}
              {farmerText(language, 'quantityLabel', {
                count: order.quantity,
              })}
              {' · '}
              {t(
                order.fulfillment === 'pickup'
                  ? 'pickupStatus'
                  : 'deliveryStatus',
              )}
            </span>
          </div>
          <div className="portal-record__aside">
            <strong>{formatRupees(order.subtotal, language)}</strong>
            <span>{t('statusPlaced')}</span>
          </div>
        </li>
      ))}
    </ul>
  )
}

function HarvestList({
  records,
  payments,
  language,
  t,
  formatDate,
  formatRupees,
  numberText,
}: {
  records: HarvestRecord[]
  payments: FarmerDemoData['payments']
  language: Language
  t: (key: FarmerTranslationKey) => string
  formatDate: (date: string, language: Language) => string
  formatRupees: (amount: number, language: Language) => string
  numberText: (key: FarmerTranslationKey, amount: number) => string
}) {
  return (
    <div className="portal-harvest-list">
      {records.map((record) => {
        const accepted = isAcceptedHarvest(record)
        const gross = acceptedHarvestValue(record)
        const paid = acceptedHarvestPayments(record, payments)
        const outstanding = acceptedHarvestOutstanding(record, payments)

        return (
          <Card className="portal-card portal-harvest-card" key={record.id}>
            <div className="portal-harvest-card__heading">
              <h2>
                {t(
                  accepted
                    ? 'acceptedStatus'
                    : record.status === 'rejected'
                      ? 'rejectedStatus'
                      : 'submittedStatus',
                )}
              </h2>
              <span>
                {t('harvestDate')}
                {': '}
                {formatDate(
                  record.acceptedAt ?? record.submittedAt,
                  language,
                )}
              </span>
            </div>
            <dl className="portal-detail-grid">
              <div>
                <dt>{t(accepted ? 'acceptedWeight' : 'submittedWeight')}</dt>
                <dd>
                  {accepted && record.acceptedWeightKg !== null
                    ? numberText('kilograms', record.acceptedWeightKg)
                    : record.submittedWeightKg
                      ? `${numberText('kilograms', record.submittedWeightKg)} · ${t('submittedStatus')}`
                      : t('noAcceptedWeight')}
                </dd>
              </div>
              <div>
                <dt>{t('grade')}</dt>
                <dd>{accepted ? record.grade : record.status === 'rejected' ? t('rejectionReason') + ': ' + (record.rejectionReason ?? '') : t('noGrade')}</dd>
              </div>
              <div>
                <dt>{t('ratePerKg')}</dt>
                <dd>
                  {accepted && record.ratePerKg !== null
                    ? numberText('rate', record.ratePerKg)
                    : t('noRate')}
                </dd>
              </div>
              <div>
                <dt>{t('grossAmount')}</dt>
                <dd>{accepted ? formatRupees(gross, language) : '—'}</dd>
              </div>
              <div>
                <dt>{t('paymentStatus')}</dt>
                <dd>
                  {paid > 0 ? t('paidStatus') : t('unpaidStatus')}
                </dd>
              </div>
              <div>
                <dt>{t('paidForHarvest')}</dt>
                <dd>
                  {accepted && paid > 0
                    ? formatRupees(paid, language)
                    : t('noPayments')}
                </dd>
              </div>
              <div>
                <dt>{t('remainingAmount')}</dt>
                <dd>
                  {accepted ? formatRupees(outstanding, language) : '—'}
                </dd>
              </div>
            </dl>
          </Card>
        )
      })}
    </div>
  )
}

export default FarmerPortal
