import { useEffect, useMemo, useRef, useState } from 'react'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Container from '../components/ui/Container'
import LanguageSwitcher from '../components/ui/LanguageSwitcher'
import type { BuyerDemoData, BuyerOrder, BuyerEnquiry } from '../buyer/types'
import { loadBuyerData, saveBuyerData } from '../buyer/storage'
import { adminText, type AdminTranslationKey } from '../i18n/adminTranslations'
import { translate, type Language } from '../i18n/translations'
import {
  acceptedHarvestOutstanding,
  acceptedHarvestValue,
  isAcceptedHarvest,
} from '../farmer/calculations'
import {
  createDemoId,
  loadDemoData,
  saveDemoData,
} from '../farmer/storage'
import type {
  FarmerDemoData,
  HarvestAuditEntry,
  HarvestRecord,
} from '../farmer/types'
import {
  clearAdminSettings,
  DEFAULT_SETTINGS,
  loadAdminSettings,
  saveAdminSettings,
  type AdminDemoSettings,
} from './settings'

type AdminSection =
  | 'overview'
  | 'farmers'
  | 'buyers'
  | 'bagOrders'
  | 'training'
  | 'harvests'
  | 'buyerOrders'
  | 'payments'
  | 'settings'

type AdminLoad = {
  farmer: FarmerDemoData
  buyer: BuyerDemoData
  warning: boolean
}

const ADMIN_SESSION_KEY = 'mushroom-hub-admin-demo-session'
const SECTIONS: { id: AdminSection; key: AdminTranslationKey; slug: string }[] = [
  { id: 'overview', key: 'overview', slug: '' },
  { id: 'farmers', key: 'farmers', slug: 'farmers' },
  { id: 'buyers', key: 'buyers', slug: 'buyers' },
  { id: 'bagOrders', key: 'bagOrders', slug: 'bag-orders' },
  { id: 'training', key: 'training', slug: 'training' },
  { id: 'harvests', key: 'harvests', slug: 'harvests' },
  { id: 'buyerOrders', key: 'buyerOrders', slug: 'buyer-orders' },
  { id: 'payments', key: 'payments', slug: 'payments' },
  { id: 'settings', key: 'settings', slug: 'settings' },
]

function readStores(): AdminLoad {
  const farmer = loadDemoData()
  const buyer = loadBuyerData()
  return {
    farmer: farmer.data,
    buyer: buyer.data,
    warning: Boolean(farmer.warning || buyer.warning),
  }
}

function readAdminSession(): boolean {
  try {
    return window.sessionStorage.getItem(ADMIN_SESSION_KEY) === 'open'
  } catch {
    return false
  }
}

function sectionFromPath(path: string): AdminSection {
  return SECTIONS.find((section) => section.slug && path.endsWith(`/${section.slug}`))?.id ?? 'overview'
}

function money(amount: number, language: Language): string {
  return new Intl.NumberFormat(language === 'hi' ? 'hi-IN' : 'en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount)
}

function numberText(value: number, language: Language): string {
  return new Intl.NumberFormat(language === 'hi' ? 'hi-IN' : 'en-IN', {
    maximumFractionDigits: 2,
  }).format(value)
}

function formatDate(date: string, language: Language, fallback: string): string {
  const value = new Date(date)
  if (Number.isNaN(value.getTime())) return fallback
  return new Intl.DateTimeFormat(language === 'hi' ? 'hi-IN' : 'en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)
}

function makeActivity(
  stores: AdminLoad,
): { at: string; kind: AdminTranslationKey; detail: string }[] {
  const profile = stores.farmer.profile
  return [
    ...(profile
      ? [{ at: profile.registeredAt, kind: 'activityFarmer' as const, detail: profile.fullName }]
      : []),
    ...stores.farmer.bagOrders.map((item) => ({
      at: item.createdAt,
      kind: 'activityBagOrder' as const,
      detail: item.id.slice(0, 8),
    })),
    ...stores.farmer.trainingRegistrations.map((item) => ({
      at: item.registeredAt,
      kind: 'activityTraining' as const,
      detail: item.sessionId,
    })),
    ...stores.farmer.harvestRecords.map((item) => ({
      at: item.submittedAt,
      kind: 'activityHarvest' as const,
      detail: item.id.slice(0, 8),
    })),
    ...stores.farmer.payments.map((item) => ({
      at: item.paidAt,
      kind: 'activityPayment' as const,
      detail: item.reference ?? item.id.slice(0, 8),
    })),
    ...stores.buyer.profiles.map((item) => ({
      at: item.createdAt,
      kind: 'activityBuyer' as const,
      detail: item.businessName,
    })),
    ...stores.buyer.enquiries.map((item) => ({
      at: item.createdAt,
      kind: 'activityEnquiry' as const,
      detail: item.id.slice(0, 8),
    })),
    ...stores.buyer.orders.map((item) => ({
      at: item.createdAt,
      kind: 'activityBuyerOrder' as const,
      detail: item.reference,
    })),
  ]
    .filter((item) => !Number.isNaN(new Date(item.at).getTime()))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 12)
}

function AdminPortal({
  language,
  onLanguageChange,
}: {
  language: Language
  onLanguageChange: (language: Language) => void
}) {
  const [pathname, setPathname] = useState(() => window.location.pathname.replace(/\/+$/, '') || '/admin')
  const [signedIn, setSignedIn] = useState(readAdminSession)
  const [accessCode, setAccessCode] = useState('')
  const [accessError, setAccessError] = useState(false)
  const [stores, setStores] = useState<AdminLoad>(readStores)
  const [settings, setSettings] = useState<AdminDemoSettings>(() => loadAdminSettings().settings)
  const [settingsInitialWarning, setSettingsInitialWarning] = useState(() => {
    const loaded = loadAdminSettings()
    return loaded.invalid || loaded.unavailable
  })
  const [globalError, setGlobalError] = useState<AdminTranslationKey | null>(null)
  const [success, setSuccess] = useState<AdminTranslationKey | null>(null)
  const [searchFarmers, setSearchFarmers] = useState('')
  const [searchBuyers, setSearchBuyers] = useState('')
  const [weightDrafts, setWeightDrafts] = useState<Record<string, string>>({})
  const [gradeDrafts, setGradeDrafts] = useState<Record<string, 'A' | 'B' | 'C'>>({})
  const [rateDrafts, setRateDrafts] = useState<Record<string, string>>({})
  const [rejectionDrafts, setRejectionDrafts] = useState<Record<string, string>>({})
  const [recordPaymentId, setRecordPaymentId] = useState('')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10))
  const paymentSubmissionRef = useRef<string | null>(null)
  const paymentInProgressRef = useRef(false)
  const [orderStatusDrafts, setOrderStatusDrafts] = useState<Record<string, 'accepted' | 'cancelled'>>({})
  const [resetOpen, setResetOpen] = useState(false)
  const [codeUnavailable, setCodeUnavailable] = useState(false)
  const t = (key: AdminTranslationKey) => adminText(language, key)
  const section = sectionFromPath(pathname)
  const sectionEntry = SECTIONS.find((item) => item.id === section) ?? SECTIONS[0]

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname.replace(/\/+$/, '') || '/admin')
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    document.documentElement.lang = language
    document.title = t('title')
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    if (description) description.content = t('description')
  }, [language])

  useEffect(() => {
    const updateStores = () => setStores(readStores())
    window.addEventListener('storage', updateStores)
    window.addEventListener('focus', updateStores)
    return () => {
      window.removeEventListener('storage', updateStores)
      window.removeEventListener('focus', updateStores)
    }
  }, [])

  useEffect(() => {
    if (!resetOpen) return
    document.querySelector<HTMLButtonElement>('.admin-reset-dialog [data-admin-cancel]')?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setResetOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.querySelector<HTMLButtonElement>('.admin-reset-trigger')?.focus()
    }
  }, [resetOpen])

  const farmer = stores.farmer
  const buyer = stores.buyer
  const acceptedHarvests = farmer.harvestRecords.filter(isAcceptedHarvest)
  const acceptedKg = acceptedHarvests.reduce((sum, record) => sum + record.acceptedWeightKg, 0)
  const acceptedValue = acceptedHarvests.reduce((sum, record) => sum + acceptedHarvestValue(record), 0)
  const paidOnAccepted = acceptedHarvests.reduce(
    (sum, harvest) =>
      sum +
      farmer.payments
        .filter((payment) => payment.harvestId === harvest.id)
        .reduce((total, payment) => total + payment.amount, 0),
    0,
  )
  const outstanding = acceptedHarvests.reduce(
    (sum, harvest) => sum + acceptedHarvestOutstanding(harvest, farmer.payments),
    0,
  )
  const pendingHarvests = farmer.harvestRecords.filter((record) => record.status === 'submitted')
  const activity = useMemo(() => makeActivity(stores), [stores])
  const tType = (type: string) => {
    const keys: Record<string, AdminTranslationKey> = {
      retailer: 'buyerRetailer',
      restaurant: 'buyerRestaurant',
      hotel: 'buyerHotel',
      wholesaler: 'buyerWholesaler',
      other: 'buyerOther',
    }
    return keys[type] ? t(keys[type]) : type
  }

  const persistFarmer = (next: FarmerDemoData, notice?: AdminTranslationKey) => {
    try {
      saveDemoData(next)
      setStores((current) => ({ ...current, farmer: next }))
      setGlobalError(null)
      setSuccess(notice ?? 'saved')
      return true
    } catch {
      setGlobalError('saveError')
      return false
    }
  }

  const persistBuyer = (next: BuyerDemoData, notice?: AdminTranslationKey) => {
    try {
      saveBuyerData(next)
      setStores((current) => ({ ...current, buyer: next }))
      setGlobalError(null)
      setSuccess(notice ?? 'saved')
      return true
    } catch {
      setGlobalError('saveError')
      return false
    }
  }

  const enterDemo = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (accessCode !== '123456') {
      setAccessError(true)
      return
    }
    try {
      window.sessionStorage.setItem(ADMIN_SESSION_KEY, 'open')
      setSignedIn(true)
      setAccessError(false)
      setCodeUnavailable(false)
    } catch {
      setCodeUnavailable(true)
    }
  }

  const closeSession = () => {
    try {
      window.sessionStorage.removeItem(ADMIN_SESSION_KEY)
      setSignedIn(false)
    } catch {
      setGlobalError('storageUnavailable')
    }
  }

  const markEnquiry = (item: BuyerEnquiry, status: 'reviewed' | 'follow-up') => {
    const currentBuyer = loadBuyerData().data
    const currentEnquiry = currentBuyer.enquiries.find(
      (enquiry) => enquiry.id === item.id,
    )
    if (!currentEnquiry || currentEnquiry.workflowStatus === status) {
      setStores(readStores())
      setGlobalError('enquiryAlreadyUpdated')
      return
    }
    const updated = {
      ...currentEnquiry,
      workflowStatus: status,
      workflowUpdatedAt: new Date().toISOString(),
    }
    persistBuyer({
      ...currentBuyer,
      enquiries: currentBuyer.enquiries.map((enquiry) =>
        enquiry.id === currentEnquiry.id ? updated : enquiry,
      ),
    })
  }

  const acceptHarvest = (record: HarvestRecord) => {
    const currentFarmer = loadDemoData().data
    const currentRecord = currentFarmer.harvestRecords.find(
      (item) => item.id === record.id,
    )
    if (!currentRecord || currentRecord.status !== 'submitted') {
      setStores(readStores())
      setGlobalError('harvestAlreadyReviewed')
      return
    }
    const weightValue = Number(weightDrafts[record.id] ?? record.submittedWeightKg ?? 0)
    const grade = gradeDrafts[record.id] ?? 'A'
    const rateDraft = rateDrafts[record.id]
    const rate = rateDraft === undefined
      ? settings.gradeRates[grade]
      : rateDraft.trim() === ''
        ? Number.NaN
        : Number(rateDraft)
    if (
      !Number.isFinite(weightValue) ||
      weightValue <= 0 ||
      !Number.isFinite(rate) ||
      rate < 0 ||
      !Number.isFinite(weightValue * rate) ||
      (grade !== 'A' && grade !== 'B' && grade !== 'C')
    ) {
      setGlobalError('validationPositive')
      return
    }
    const acceptedAt = new Date().toISOString()
    const entry: HarvestAuditEntry = {
      id: createDemoId(),
      action: 'accepted',
      at: acceptedAt,
      previousStatus: currentRecord.status,
      newStatus: 'accepted',
      note: null,
    }
    const accepted: HarvestRecord = {
      ...currentRecord,
      status: 'accepted',
      acceptedAt,
      rejectedAt: null,
      rejectionReason: null,
      acceptedWeightKg: weightValue,
      grade,
      ratePerKg: rate,
      auditTrail: [...(currentRecord.auditTrail ?? []), entry],
    }
    persistFarmer({
      ...currentFarmer,
      harvestRecords: currentFarmer.harvestRecords.map((item) =>
        item.id === currentRecord.id ? accepted : item,
      ),
    })
  }

  const rejectHarvest = (record: HarvestRecord) => {
    const currentFarmer = loadDemoData().data
    const currentRecord = currentFarmer.harvestRecords.find(
      (item) => item.id === record.id,
    )
    if (!currentRecord || currentRecord.status !== 'submitted') {
      setStores(readStores())
      setGlobalError('harvestAlreadyReviewed')
      return
    }
    const reason = (rejectionDrafts[record.id] ?? '').trim()
    if (reason.length === 0) {
      setGlobalError('validationReason')
      return
    }
    const rejectedAt = new Date().toISOString()
    const entry: HarvestAuditEntry = {
      id: createDemoId(),
      action: 'rejected',
      at: rejectedAt,
      previousStatus: currentRecord.status,
      newStatus: 'rejected',
      note: reason,
    }
    const rejected: HarvestRecord = {
      ...currentRecord,
      status: 'rejected',
      acceptedAt: null,
      acceptedWeightKg: null,
      grade: null,
      ratePerKg: null,
      rejectedAt,
      rejectionReason: reason,
      auditTrail: [...(currentRecord.auditTrail ?? []), entry],
    }
    persistFarmer({
      ...currentFarmer,
      harvestRecords: currentFarmer.harvestRecords.map((item) =>
        item.id === currentRecord.id ? rejected : item,
      ),
    })
  }

  const recordPayment = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (paymentInProgressRef.current) return
    paymentInProgressRef.current = true
    const currentFarmer = loadDemoData().data
    const currentAcceptedHarvests =
      currentFarmer.harvestRecords.filter(isAcceptedHarvest)
    const firstDueHarvest = currentAcceptedHarvests.find(
      (item) => acceptedHarvestOutstanding(item, currentFarmer.payments) > 0,
    )
    const targetId = recordPaymentId || firstDueHarvest?.id
    const record = currentAcceptedHarvests.find((item) => item.id === targetId)
    const amount = Number(paymentAmount)
    const signature = JSON.stringify([targetId, paymentAmount, paymentDate])
    const paidAt = new Date(`${paymentDate}T12:00:00`)
    const validPaymentDate =
      /^\d{4}-\d{2}-\d{2}$/.test(paymentDate) &&
      !Number.isNaN(paidAt.getTime()) &&
      paidAt.toISOString().slice(0, 10) === paymentDate
    const due = record
      ? acceptedHarvestOutstanding(record, currentFarmer.payments)
      : 0
    if (
      !record ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      amount > due ||
      due <= 0 ||
      !validPaymentDate
    ) {
      paymentInProgressRef.current = false
      setGlobalError('paymentValidation')
      return
    }
    if (paymentSubmissionRef.current === signature) {
      paymentInProgressRef.current = false
      setGlobalError('duplicatePayment')
      return
    }
    const paymentId = createDemoId()
    const payment = {
      id: paymentId,
      reference: `PAY-${paymentId.slice(0, 8).toUpperCase()}`,
      harvestId: record.id,
      amount,
      paidAt: paidAt.toISOString(),
      status: 'paid' as const,
    }
    if (persistFarmer({
      ...currentFarmer,
      payments: [payment, ...currentFarmer.payments],
    })) {
      paymentSubmissionRef.current = signature
      setPaymentAmount('')
      setSuccess('paid')
    } else {
      paymentSubmissionRef.current = null
    }
    paymentInProgressRef.current = false
  }

  const updateBuyerOrder = (order: BuyerOrder) => {
    const currentBuyer = loadBuyerData().data
    const currentOrder = currentBuyer.orders.find((item) => item.id === order.id)
    if (
      !currentOrder ||
      currentOrder.status !== 'placed' ||
      !['accepted', 'cancelled'].includes(orderStatusDrafts[order.id] ?? 'accepted')
    ) {
      setStores(readStores())
      setGlobalError('orderAlreadyUpdated')
      return
    }
    const nextStatus = orderStatusDrafts[order.id] ?? 'accepted'
    const at = new Date().toISOString()
    const updated: BuyerOrder = {
      ...currentOrder,
      status: nextStatus,
      statusHistory: [
        ...(currentOrder.statusHistory ?? [{ status: 'placed' as const, at: currentOrder.createdAt }]),
        { status: nextStatus, at, previousStatus: currentOrder.status },
      ],
    }
    persistBuyer({
      ...currentBuyer,
      orders: currentBuyer.orders.map((item) => item.id === order.id ? updated : item),
    })
  }

  const saveSettings = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const rates = settings.gradeRates
    if (
      ![rates.A, rates.B, rates.C].every(
        (rate) => Number.isFinite(rate) && rate >= 0,
      ) ||
      !Number.isFinite(settings.bagUnitPrice) ||
      settings.bagUnitPrice <= 0
    ) {
      setGlobalError('validationPositive')
      return
    }
    try {
      saveAdminSettings(settings)
      setSettingsInitialWarning(false)
      setGlobalError(null)
      setSuccess('settingsSaved')
    } catch {
      setGlobalError('storageUnavailable')
    }
  }

  const resetSettings = () => {
    try {
      clearAdminSettings()
      setSettings(DEFAULT_SETTINGS)
      setSettingsInitialWarning(false)
      setResetOpen(false)
      setSuccess('settingsSaved')
      setGlobalError(null)
    } catch {
      setGlobalError('storageUnavailable')
      setResetOpen(false)
    }
  }

  const activityKind = (key: AdminTranslationKey) => t(key)
  const metricItems: { key: AdminTranslationKey; value: string | number }[] = [
    { key: 'farmersMetric', value: farmer.profile ? 1 : 0 },
    { key: 'buyersMetric', value: buyer.profiles.length },
    { key: 'enquiriesMetric', value: buyer.enquiries.length },
    { key: 'bagOrdersMetric', value: farmer.bagOrders.length },
    { key: 'trainingMetric', value: farmer.trainingRegistrations.length },
    { key: 'pendingHarvests', value: pendingHarvests.length },
    { key: 'acceptedKg', value: `${numberText(acceptedKg, language)} ${t('kilograms')}` },
    { key: 'acceptedValue', value: money(acceptedValue, language) },
    { key: 'buyerOrderMetric', value: buyer.orders.length },
    { key: 'paymentsMetric', value: money(paidOnAccepted, language) },
    { key: 'outstanding', value: money(outstanding, language) },
  ]

  const renderOverview = () => (
    <>
      <p className="admin-page-intro">{t('metricsIntro')}</p>
      <div className="admin-metrics">
        {metricItems.map((item) => (
          <Card className="portal-card admin-metric" key={item.key}>
            <span>{t(item.key)}</span><strong>{item.value}</strong>
          </Card>
        ))}
      </div>
      <Card className="portal-card">
        <h2>{t('recentActivity')}</h2>
        {activity.length ? (
          <ul className="admin-activity-list">
            {activity.map((item, index) => (
              <li key={`${item.kind}-${item.at}-${index}`}>
                <div><strong>{activityKind(item.kind)}</strong><span>{item.detail}</span></div>
                <time dateTime={item.at}>{formatDate(item.at, language, t('dateUnavailable'))}</time>
              </li>
            ))}
          </ul>
        ) : <p className="portal-empty">{t('noActivity')}</p>}
      </Card>
    </>
  )

  const renderFarmers = () => {
    const profile = farmer.profile
    const query = searchFarmers.trim().toLowerCase()
    const matches = profile && [
      profile.fullName,
      profile.mobile,
      profile.district,
      profile.locality,
    ].some((value) => value.toLowerCase().includes(query))
    return (
      <>
        <div className="portal-field admin-search">
          <label className="portal-field__label" htmlFor="admin-farmer-search">{t('search')}</label>
          <input className="portal-input" id="admin-farmer-search" placeholder={t('searchFarmers')} value={searchFarmers} onChange={(event) => setSearchFarmers(event.target.value)} />
        </div>
        {profile && matches ? (
          <Card className="portal-card">
            <h2>{profile.fullName}</h2>
            <dl className="portal-detail-grid">
              <div><dt>{t('mobile')}</dt><dd>{profile.mobile}</dd></div>
              <div><dt>{t('district')}</dt><dd>{profile.district}</dd></div>
              <div><dt>{t('locality')}</dt><dd>{profile.locality}</dd></div>
              <div><dt>{t('created')}</dt><dd>{formatDate(profile.registeredAt, language, t('dateUnavailable'))}</dd></div>
              <div><dt>{t('bagOrdersMetric')}</dt><dd>{farmer.bagOrders.length}</dd></div>
              <div><dt>{t('registrations')}</dt><dd>{farmer.trainingRegistrations.length}</dd></div>
              <div><dt>{t('harvests')}</dt><dd>{farmer.harvestRecords.length}</dd></div>
              <div><dt>{t('paymentsMetric')}</dt><dd>{money(farmer.payments.reduce((sum, payment) => sum + payment.amount, 0), language)}</dd></div>
            </dl>
            {farmer.bagOrders.length > 0 && (
              <section className="admin-related-records">
                <h3>{t('bagOrdersMetric')}</h3>
                <ul className="admin-inline-list">
                  {farmer.bagOrders.map((order) => (
                    <li key={order.id}>
                      {order.id} · {numberText(order.quantity, language)} {t('bags')} · {money(order.subtotal, language)} · {t(order.fulfillment)} · {t('placed')}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {farmer.trainingRegistrations.length > 0 && (
              <section className="admin-related-records">
                <h3>{t('registrations')}</h3>
                <ul className="admin-inline-list">
                  {farmer.trainingRegistrations.map((registration) => (
                    <li key={registration.id}>
                      {t('demoSession')} · {t(registration.sessionId.endsWith('14') ? 'trainingDateOne' : 'trainingDateTwo')} · {formatDate(registration.registeredAt, language, t('dateUnavailable'))}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {farmer.harvestRecords.length > 0 && (
              <section className="admin-related-records">
                <h3>{t('harvests')}</h3>
                <ul className="admin-inline-list">
                  {farmer.harvestRecords.map((record) => {
                    const harvestPayments = farmer.payments.filter(
                      (payment) => payment.harvestId === record.id,
                    )
                    return (
                      <li key={record.id}>
                        {record.id.slice(0, 8)} · {t(record.status)} · {record.status === 'accepted' ? `${record.acceptedWeightKg} ${t('kilograms')} · ${record.grade} · ${money(acceptedHarvestValue(record), language)}` : `${record.submittedWeightKg ?? '—'} ${t('kilograms')}`}
                        {harvestPayments.map((payment) => (
                          <span className="admin-related-payment" key={payment.id}>
                            {payment.reference ?? payment.id.slice(0, 8)} · {money(payment.amount, language)} · {formatDate(payment.paidAt, language, t('dateUnavailable'))}
                          </span>
                        ))}
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}
          </Card>
        ) : profile ? <p className="portal-empty">{t('noResults')}</p> : <p className="portal-empty">{t('noFarmers')}</p>}
      </>
    )
  }

  const renderBuyers = () => {
    const query = searchBuyers.trim().toLowerCase()
    const profiles = buyer.profiles.filter((profile) =>
      [
        profile.businessName,
        profile.contactName,
        profile.district,
        profile.locality,
        profile.buyerType,
      ].some((value) => value.toLowerCase().includes(query)),
    )
    if (!buyer.profiles.length) return <p className="portal-empty">{t('noBuyers')}</p>
    if (!profiles.length) return <p className="portal-empty">{t('noResults')}</p>
    return (
      <>
        <div className="portal-field admin-search">
          <label className="portal-field__label" htmlFor="admin-buyer-search">{t('search')}</label>
          <input className="portal-input" id="admin-buyer-search" placeholder={t('searchBuyers')} value={searchBuyers} onChange={(event) => setSearchBuyers(event.target.value)} />
        </div>
        <div className="admin-record-grid">
          {profiles.map((profile) => {
            const enquiries = buyer.enquiries.filter((item) => item.buyerId === profile.id)
            return (
              <Card className="portal-card" key={profile.id}>
                <h2>{profile.businessName}</h2>
                <dl className="portal-detail-list">
                  <div><dt>{t('contact')}</dt><dd>{profile.contactName}</dd></div>
                  <div><dt>{t('mobile')}</dt><dd>{profile.mobile}</dd></div>
                  <div><dt>{t('type')}</dt><dd>{tType(profile.buyerType)}</dd></div>
                  <div><dt>{t('district')}</dt><dd>{profile.district}</dd></div>
                  <div><dt>{t('locality')}</dt><dd>{profile.locality}</dd></div>
                </dl>
                {enquiries.map((enquiry) => (
                  <article className="admin-enquiry" key={enquiry.id}>
                    <p><strong>{t('workflow')}: </strong>{t(enquiry.workflowStatus === 'reviewed' ? 'reviewed' : enquiry.workflowStatus === 'follow-up' ? 'followUp' : 'new')}</p>
                    <p><strong>{t('expected')}: </strong>{enquiry.expectedQuantity}</p>
                    <p><strong>{t('enquiryMessage')}: </strong>{enquiry.message}</p>
                    <p>{formatDate(enquiry.createdAt, language, t('dateUnavailable'))}</p>
                    <div className="portal-form__actions">
                      <Button variant="secondary" onClick={() => markEnquiry(enquiry, 'reviewed')}>{t('markReviewed')}</Button>
                      <Button variant="text" onClick={() => markEnquiry(enquiry, 'follow-up')}>{t('markFollowUp')}</Button>
                    </div>
                  </article>
                ))}
              </Card>
            )
          })}
        </div>
      </>
    )
  }

  const renderBagOrders = () => {
    if (!farmer.bagOrders.length) return <p className="portal-empty">{t('noOrders')}</p>
    return (
      <div className="admin-record-grid">
        {farmer.bagOrders.map((order) => (
          <Card className="portal-card" key={order.id}>
            <h2>{t('orderReference')}: {order.id.slice(0, 8)}</h2>
            <dl className="portal-detail-grid">
              <div><dt>{t('farmersMetric')}</dt><dd>{farmer.profile?.fullName ?? '—'}</dd></div>
              <div><dt>{t('quantity')}</dt><dd>{order.quantity} {t('bags')}</dd></div>
              <div><dt>{t('subtotal')}</dt><dd>{money(order.subtotal, language)}</dd></div>
              <div><dt>{t('fulfillment')}</dt><dd>{t(order.fulfillment)}</dd></div>
              <div><dt>{t('status')}</dt><dd>{t('placed')}</dd></div>
              <div><dt>{t('date')}</dt><dd>{formatDate(order.createdAt, language, t('dateUnavailable'))}</dd></div>
            </dl>
          </Card>
        ))}
      </div>
    )
  }

  const renderTraining = () => {
    if (!farmer.trainingRegistrations.length) return <p className="portal-empty">{t('noRegistrations')}</p>
    return (
      <div className="admin-record-grid">
        {farmer.trainingRegistrations.map((registration) => (
          <Card className="portal-card" key={registration.id}>
            <span className="portal-demo-tag">{t('demoSession')}</span>
            <h2>{farmer.profile?.fullName ?? '—'}</h2>
            <dl className="portal-detail-list">
              <div><dt>{t('sessionId')}</dt><dd>{t('demoSession')}</dd></div>
              <div><dt>{t('date')}</dt><dd>{t(registration.sessionId.endsWith('14') ? 'trainingDateOne' : 'trainingDateTwo')}</dd></div>
              <div><dt>{t('registeredAt')}</dt><dd>{formatDate(registration.registeredAt, language, t('dateUnavailable'))}</dd></div>
              <div><dt>{t('status')}</dt><dd>{t('registered')}</dd></div>
            </dl>
          </Card>
        ))}
      </div>
    )
  }

  const renderHarvests = () => {
    if (!farmer.harvestRecords.length) return <Card className="portal-card portal-empty-card"><p>{t('noHarvests')}</p></Card>
    return (
      <div className="admin-record-grid">
        {farmer.harvestRecords.map((record) => {
          const accepted = isAcceptedHarvest(record)
          const pending = record.status === 'submitted'
          return (
            <Card className="portal-card admin-harvest-card" key={record.id}>
              <div className="portal-card__heading"><h2>{farmer.profile?.fullName ?? '—'}</h2><span>{t(record.status)}</span></div>
              <dl className="portal-detail-grid">
                <div><dt>{t('date')}</dt><dd>{formatDate(record.submittedAt, language, t('dateUnavailable'))}</dd></div>
                <div><dt>{t('submittedWeight')}</dt><dd>{record.submittedWeightKg === undefined || record.submittedWeightKg === null ? '—' : `${numberText(record.submittedWeightKg, language)} ${t('kilograms')}`}</dd></div>
                {accepted && <>
                  <div><dt>{t('acceptedWeight')}</dt><dd>{numberText(record.acceptedWeightKg, language)} {t('kilograms')}</dd></div>
                  <div><dt>{t('grade')}</dt><dd>{record.grade}</dd></div>
                  <div><dt>{t('rate')}</dt><dd>{money(record.ratePerKg, language)}/{t('kilograms')}</dd></div>
                  <div><dt>{t('harvestedValue')}</dt><dd>{money(acceptedHarvestValue(record), language)}</dd></div>
                </>}
                {record.status === 'rejected' && <div><dt>{t('reason')}</dt><dd>{record.rejectionReason}</dd></div>}
              </dl>
              {pending && (
                <div className="admin-review-form">
                  <h3>{t('review')}</h3>
                  <div className="portal-form-grid">
                    <div className="portal-field">
                      <label className="portal-field__label" htmlFor={`harvest-weight-${record.id}`}>{t('acceptedWeight')}</label>
                      <input className="portal-input" id={`harvest-weight-${record.id}`} type="number" min="0.1" step="0.1" value={weightDrafts[record.id] ?? (record.submittedWeightKg ? String(record.submittedWeightKg) : '')} onChange={(event) => setWeightDrafts((current) => ({ ...current, [record.id]: event.target.value }))} />
                    </div>
                    <div className="portal-field">
                      <label className="portal-field__label" htmlFor={`harvest-grade-${record.id}`}>{t('grade')}</label>
                      <select className="portal-input" id={`harvest-grade-${record.id}`} value={gradeDrafts[record.id] ?? 'A'} onChange={(event) => { const grade = event.target.value as 'A' | 'B' | 'C'; setGradeDrafts((current) => ({ ...current, [record.id]: grade })); setRateDrafts((current) => ({ ...current, [record.id]: String(settings.gradeRates[grade]) })) }}>
                        <option value="A">A</option><option value="B">B</option><option value="C">C</option>
                      </select>
                    </div>
                    <div className="portal-field">
                      <label className="portal-field__label" htmlFor={`harvest-rate-${record.id}`}>{t('rate')}</label>
                      <input className="portal-input" id={`harvest-rate-${record.id}`} type="number" min="0" step="0.01" value={rateDrafts[record.id] ?? String(settings.gradeRates[gradeDrafts[record.id] ?? 'A'])} onChange={(event) => setRateDrafts((current) => ({ ...current, [record.id]: event.target.value }))} />
                    </div>
                    <div className="portal-field">
                      <label className="portal-field__label" htmlFor={`harvest-reason-${record.id}`}>{t('reason')}</label>
                      <input className="portal-input" id={`harvest-reason-${record.id}`} value={rejectionDrafts[record.id] ?? ''} onChange={(event) => setRejectionDrafts((current) => ({ ...current, [record.id]: event.target.value }))} />
                    </div>
                  </div>
                  <p className="portal-hint">{t('submitted')} · {t('harvests')}</p>
                  <div className="portal-form__actions">
                    <Button onClick={() => acceptHarvest(record)}>{t('acceptHarvest')}</Button>
                    <Button variant="secondary" onClick={() => rejectHarvest(record)}>{t('rejectHarvest')}</Button>
                  </div>
                </div>
              )}
              {record.auditTrail && record.auditTrail.length > 0 && (
                <ul className="admin-audit-list">
                  {record.auditTrail.map((entry) => <li key={entry.id}>{t(entry.action)} · {formatDate(entry.at, language, t('dateUnavailable'))}{entry.note ? ` · ${entry.note}` : ''}</li>)}
                </ul>
              )}
            </Card>
          )
        })}
      </div>
    )
  }

  const renderBuyerOrders = () => {
    if (!buyer.orders.length) return <p className="portal-empty">{t('noBuyerOrders')}</p>
    return (
      <div className="admin-record-grid">
        {buyer.orders.map((order) => {
          const profile = buyer.profiles.find((item) => item.id === order.buyerId)
          return (
            <Card className="portal-card" key={order.id}>
              <h2>{t('orderReference')}: {order.reference}</h2>
              <dl className="portal-detail-grid">
                <div><dt>{t('business')}</dt><dd>{profile?.businessName ?? '—'}</dd></div>
                <div><dt>{t('contact')}</dt><dd>{profile?.contactName ?? '—'}</dd></div>
                <div><dt>{t('product')}</dt><dd>{t(order.productId === 'sample-grey-oyster' ? 'sampleGrey' : 'sampleWhite')}</dd></div>
                <div><dt>{t('quantity')}</dt><dd>{numberText(order.quantityKg, language)} {t('kilograms')}</dd></div>
                <div><dt>{t('subtotal')}</dt><dd>{money(order.subtotal, language)}</dd></div>
                <div><dt>{t('fulfillment')}</dt><dd>{t(order.fulfillment)}</dd></div>
                <div><dt>{t('status')}</dt><dd>{t(order.status === 'accepted' ? 'acceptedOrder' : order.status === 'cancelled' ? 'cancelled' : 'awaitingReview')}</dd></div>
              </dl>
              {order.status === 'placed' && (
                <div className="portal-form">
                  <label className="portal-field__label" htmlFor={`buyer-order-status-${order.id}`}>{t('orderStatus')}</label>
                  <select className="portal-input" id={`buyer-order-status-${order.id}`} value={orderStatusDrafts[order.id] ?? 'accepted'} onChange={(event) => setOrderStatusDrafts((current) => ({ ...current, [order.id]: event.target.value as 'accepted' | 'cancelled' }))}>
                    <option value="accepted">{t('acceptedOrder')}</option><option value="cancelled">{t('cancelled')}</option>
                  </select>
                  <Button onClick={() => updateBuyerOrder(order)}>{t('updateStatus')}</Button>
                </div>
              )}
              <p className="portal-storage-notice">{t('orderNotSent')}</p>
              {order.statusHistory && order.statusHistory.length > 0 && <ul className="admin-audit-list">{order.statusHistory.map((entry, index) => <li key={`${entry.at}-${index}`}>{t(entry.status === 'placed' ? 'placed' : entry.status === 'accepted' ? 'acceptedOrder' : 'cancelled')} · {formatDate(entry.at, language, t('dateUnavailable'))}</li>)}</ul>}
            </Card>
          )
        })}
      </div>
    )
  }

  const renderPayments = () => {
    const dueHarvests = acceptedHarvests
      .map((record) => ({ record, due: acceptedHarvestOutstanding(record, farmer.payments) }))
      .filter((item) => item.due > 0)
    const allPayments = farmer.payments.filter((payment) =>
      acceptedHarvests.some((record) => record.id === payment.harvestId),
    )
    return (
      <>
        {dueHarvests.length ? (
          <Card className="portal-card">
            <h2>{t('recordPayment')}</h2>
            <p className="portal-hint">{t('paymentNotReal')}</p>
            <form className="portal-form" onSubmit={recordPayment}>
              <div className="portal-form-grid">
                <div className="portal-field">
                  <label className="portal-field__label" htmlFor="payment-harvest">{t('paymentHarvest')}</label>
                  <select className="portal-input" id="payment-harvest" value={recordPaymentId || dueHarvests[0].record.id} onChange={(event) => { paymentSubmissionRef.current = null; setRecordPaymentId(event.target.value) }}>
                    {dueHarvests.map(({ record, due }) => <option key={record.id} value={record.id}>{record.id.slice(0, 8)} · {money(due, language)} {t('outstanding')}</option>)}
                  </select>
                </div>
                <div className="portal-field">
                  <label className="portal-field__label" htmlFor="payment-amount">{t('paymentAmount')}</label>
                  <input className="portal-input" id="payment-amount" type="number" min="0.01" step="0.01" max={dueHarvests.find((item) => item.record.id === (recordPaymentId || dueHarvests[0].record.id))?.due} value={paymentAmount} onChange={(event) => { paymentSubmissionRef.current = null; setPaymentAmount(event.target.value) }} required />
                </div>
                <div className="portal-field">
                  <label className="portal-field__label" htmlFor="payment-date">{t('paymentDate')}</label>
                  <input className="portal-input" id="payment-date" type="date" value={paymentDate} onChange={(event) => { paymentSubmissionRef.current = null; setPaymentDate(event.target.value) }} required />
                </div>
              </div>
              <Button type="submit">{t('recordPayment')}</Button>
            </form>
          </Card>
        ) : <p className="portal-empty">{t('noDue')}</p>}
        <Card className="portal-card admin-payments-card">
          <h2>{t('paymentsMetric')}</h2>
          {allPayments.length ? (
            <ul className="admin-activity-list">
              {allPayments.map((payment) => (
                <li key={payment.id}>
                  <div><strong>{payment.reference ?? payment.id.slice(0, 8)}</strong><span>{payment.harvestId.slice(0, 8)} · {money(payment.amount, language)}</span></div>
                  <time dateTime={payment.paidAt}>{formatDate(payment.paidAt, language, t('dateUnavailable'))}</time>
                </li>
              ))}
            </ul>
          ) : <p className="portal-empty">{t('noPayments')}</p>}
          <p className="portal-storage-notice">{t('paymentNotReal')}</p>
        </Card>
      </>
    )
  }

  const renderSettings = () => (
    <Card className="portal-card admin-settings-card">
      <h2>{t('configTitle')}</h2>
      <p>{t('configIntro')}</p>
      {settingsInitialWarning && <p className="portal-warning" role="status">{t('invalidStorage')}</p>}
      <form className="portal-form" onSubmit={saveSettings}>
        <div className="portal-form-grid">
          <div className="portal-field">
            <label className="portal-field__label" htmlFor="setting-bag-price">{t('bagUnitPrice')}</label>
            <input className="portal-input" id="setting-bag-price" type="number" min="0.01" step="0.01" value={settings.bagUnitPrice} onChange={(event) => setSettings((current) => ({ ...current, bagUnitPrice: Number(event.target.value) }))} />
          </div>
          {(['A', 'B', 'C'] as const).map((grade) => (
            <div className="portal-field" key={grade}>
              <label className="portal-field__label" htmlFor={`setting-grade-${grade}`}>{t(`grade${grade}` as AdminTranslationKey)}</label>
              <input className="portal-input" id={`setting-grade-${grade}`} type="number" min="0" step="0.01" value={settings.gradeRates[grade]} onChange={(event) => setSettings((current) => ({ ...current, gradeRates: { ...current.gradeRates, [grade]: event.target.value === '' ? Number.NaN : Number(event.target.value) } }))} />
            </div>
          ))}
        </div>
        <p className="portal-storage-notice">{t('storage')}</p>
        <div className="portal-form__actions">
          <Button type="submit">{t('saveSettings')}</Button>
          <Button className="admin-reset-trigger" variant="secondary" onClick={() => setResetOpen(true)}>{t('resetSettings')}</Button>
        </div>
      </form>
    </Card>
  )

  const renderSection = () => {
    switch (section) {
      case 'overview': return renderOverview()
      case 'farmers': return renderFarmers()
      case 'buyers': return renderBuyers()
      case 'bagOrders': return renderBagOrders()
      case 'training': return renderTraining()
      case 'harvests': return renderHarvests()
      case 'buyerOrders': return renderBuyerOrders()
      case 'payments': return renderPayments()
      case 'settings': return renderSettings()
    }
  }

  const resetDialog = resetOpen ? (
    <div className="portal-dialog-backdrop" role="presentation">
      <section className="portal-dialog admin-reset-dialog" role="alertdialog" aria-modal="true" aria-labelledby="admin-reset-title" aria-describedby="admin-reset-copy">
        <h2 id="admin-reset-title">{t('resetTitle')}</h2>
        <p id="admin-reset-copy">{t('resetCopy')}</p>
        <div className="portal-form__actions">
          <Button variant="secondary" data-admin-cancel="" onClick={() => setResetOpen(false)}>{t('cancel')}</Button>
          <Button onClick={resetSettings}>{t('confirmReset')}</Button>
        </div>
      </section>
    </div>
  ) : null

  return (
    <div className="app-shell farmer-portal admin-portal">
      <a className="skip-link" href="#admin-main">{t('skip')}</a>
      <header className="portal-header">
        <Container className="portal-header__inner">
          <div className="portal-header__brand">
            <a className="brand" href="/" aria-label={t('brand')}>
              <span className="brand__mark" aria-hidden="true">M</span>
              <span className="brand__text"><span className="brand__name">{t('brand')}</span><span className="brand__descriptor">{t('location')}</span></span>
            </a>
            <a className="portal-home-link" href="/">{t('home')}</a>
          </div>
          <div className="portal-header__tools">
            <LanguageSwitcher language={language} onLanguageChange={onLanguageChange} />
            {signedIn && <Button variant="secondary" onClick={closeSession}>{t('logout')}</Button>}
          </div>
        </Container>
      </header>
      <div className="portal-demo-banner">{t('warning')}</div>
      <Container><p className="portal-storage-notice">{t('storage')}</p></Container>
      {globalError && <Container><p className="portal-warning" role="alert">{t(globalError)}</p></Container>}
      {success && <Container><p className="portal-success" role="status">{t(success)}</p></Container>}
      {!signedIn ? (
        <main className="portal-main" id="admin-main">
          <Container className="portal-content portal-narrow">
            <header className="portal-page-heading"><h1>{t('accessTitle')}</h1><p>{t('accessCopy')}</p></header>
            <Card className="portal-card admin-access-card">
              <form className="portal-form" onSubmit={enterDemo}>
                <div className="portal-field">
                  <label className="portal-field__label" htmlFor="admin-demo-code">{t('code')}</label>
                  <input className="portal-input" id="admin-demo-code" type="text" inputMode="numeric" maxLength={6} value={accessCode} onChange={(event) => { setAccessCode(event.target.value); setAccessError(false) }} aria-invalid={accessError || codeUnavailable} aria-describedby="admin-code-hint" />
                  <span className="portal-hint" id="admin-code-hint">{t('codeHint')}</span>
                  {accessError && <span className="portal-field__error" role="alert">{t('invalidCode')}</span>}
                  {codeUnavailable && <span className="portal-field__error" role="alert">{t('storageUnavailable')}</span>}
                </div>
                <Button type="submit">{t('continue')}</Button>
              </form>
            </Card>
          </Container>
        </main>
      ) : (
        <>
          <nav className="portal-nav" aria-label={t('title')}>
            <Container className="portal-nav__inner">
              {SECTIONS.map((item) => {
                const href = item.slug ? `/admin/${item.slug}` : '/admin'
                return <a className="portal-nav__link" href={href} key={item.id} aria-current={section === item.id ? 'page' : undefined}>{t(item.key)}</a>
              })}
              <a className="portal-nav__link" href="/admin/farmer-applications">
                {translate(language, 'adminFarmerApplications')}
              </a>
            </Container>
          </nav>
          {stores.warning && <Container><p className="portal-warning" role="status">{t('invalidStorage')}</p></Container>}
          <main className="portal-main" id="admin-main">
            <Container className="portal-content">
              <header className="portal-page-heading">
                <p className="eyebrow">{t('warning')}</p>
                <h1>{t(section === 'overview' ? 'overviewTitle' : sectionEntry.key)}</h1>
                {section === 'overview' && <p>{t('metricsIntro')}</p>}
              </header>
              {renderSection()}
            </Container>
          </main>
        </>
      )}
      <footer className="portal-footer">
        <Container className="portal-footer__inner"><span>{t('title')} · {t('location')}</span><span>{t('storage')}</span></Container>
      </footer>
      {resetDialog}
    </div>
  )
}

export default AdminPortal
