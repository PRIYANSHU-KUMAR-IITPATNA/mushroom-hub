import { useEffect, useMemo, useRef, useState } from 'react'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Container from '../components/ui/Container'
import LanguageSwitcher from '../components/ui/LanguageSwitcher'
import type { Language } from '../i18n/translations'
import { buyerText, type BuyerTranslationKey } from '../i18n/buyerTranslations'
import {
  calculateBuyerSubtotal,
  clearBuyerData,
  createBuyerId,
  createBuyerOrder,
  loadBuyerData,
  saveBuyerData,
} from './storage'
import type {
  BuyerDemoData,
  BuyerDemoProduct,
  BuyerEnquiry,
  BuyerOrder,
  BuyerProfile,
  BuyerType,
} from './types'

type BuyerSection = 'dashboard' | 'browse' | 'orders' | 'enquiry' | 'profile'
type EnquiryDraft = Omit<BuyerProfile, 'id' | 'createdAt' | 'mobileVerified'> & {
  expectedQuantity: string
  message: string
}
type BuyerErrors = Partial<Record<keyof EnquiryDraft, BuyerTranslationKey>>

const SESSION_KEY = 'mushroom-hub-buyer-demo-session'
const DEMO_PRODUCTS: BuyerDemoProduct[] = [
  {
    id: 'sample-white-oyster',
    nameKey: 'whiteOyster',
    typeKey: 'oysterType',
    unitPrice: 180,
    sampleAvailabilityKg: 15,
    descriptionKey: 'whiteDescription',
  },
  {
    id: 'sample-grey-oyster',
    nameKey: 'greyOyster',
    typeKey: 'oysterType',
    unitPrice: 200,
    sampleAvailabilityKg: 10,
    descriptionKey: 'greyDescription',
  },
]
const SECTIONS: { section: BuyerSection; label: BuyerTranslationKey; path: string }[] = [
  { section: 'dashboard', label: 'dashboard', path: '/buyer' },
  { section: 'browse', label: 'browse', path: '/buyer/browse' },
  { section: 'orders', label: 'orders', path: '/buyer/orders' },
  { section: 'enquiry', label: 'enquiry', path: '/buyer/enquiry' },
  { section: 'profile', label: 'profile', path: '/buyer/profile' },
]
const SECTION_TITLES: Record<BuyerSection, BuyerTranslationKey> = {
  dashboard: 'dashboard',
  browse: 'browseTitle',
  orders: 'myOrdersTitle',
  enquiry: 'enquiry',
  profile: 'businessProfileTitle',
}
const SECTION_INTROS: Record<BuyerSection, BuyerTranslationKey | null> = {
  dashboard: 'pageIntro',
  browse: 'browseIntro',
  orders: 'myOrdersIntro',
  enquiry: 'enquiryNotApproval',
  profile: 'profileIntro',
}

const emptyEnquiry: EnquiryDraft = {
  contactName: '',
  businessName: '',
  mobile: '',
  buyerType: 'retailer',
  state: '',
  district: '',
  locality: '',
  pinCode: '',
  expectedQuantity: '',
  message: '',
}

function sectionForPath(pathname: string): BuyerSection {
  return SECTIONS.find((item) => item.path === pathname)?.section ?? 'dashboard'
}

function getSessionMobile(): string {
  try {
    return window.sessionStorage.getItem(SESSION_KEY) ?? ''
  } catch {
    return ''
  }
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
  required = true,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  type?: string
  inputMode?: 'text' | 'numeric' | 'tel'
  maxLength?: number
  required?: boolean
}) {
  return (
    <div className="portal-field">
      <label className="portal-field__label" htmlFor={id}>{label}</label>
      <input
        className={`portal-input${error ? ' portal-input--error' : ''}`}
        id={id}
        name={id}
        type={type}
        inputMode={inputMode}
        maxLength={maxLength}
        required={required}
        value={value}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error && <span className="portal-field__error" id={`${id}-error`} role="alert">{error}</span>}
    </div>
  )
}

function formatMoney(amount: number, language: Language): string {
  return new Intl.NumberFormat(language === 'hi' ? 'hi-IN' : 'en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatQuantity(amount: number, language: Language): string {
  return buyerText(language, 'kg').replace(
    '{amount}',
    new Intl.NumberFormat(language === 'hi' ? 'hi-IN' : 'en-IN', {
      maximumFractionDigits: 2,
    }).format(amount),
  )
}

function formatDate(value: string, language: Language, fallback: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return new Intl.DateTimeFormat(language === 'hi' ? 'hi-IN' : 'en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function validateEnquiry(draft: EnquiryDraft): BuyerErrors {
  const errors: BuyerErrors = {}
  if (draft.contactName.trim().length < 2) errors.contactName = 'invalidName'
  if (draft.businessName.trim().length < 2) errors.businessName = 'invalidRequired'
  if (!/^[6-9]\d{9}$/.test(draft.mobile.replace(/\D/g, ''))) errors.mobile = 'invalidMobile'
  if (!draft.state.trim()) errors.state = 'invalidRequired'
  if (!draft.district.trim()) errors.district = 'invalidRequired'
  if (!draft.locality.trim()) errors.locality = 'invalidRequired'
  if (!/^\d{6}$/.test(draft.pinCode.trim())) errors.pinCode = 'invalidPin'
  if (!draft.expectedQuantity) errors.expectedQuantity = 'invalidRequired'
  if (draft.message.trim().length < 10 || draft.message.trim().length > 500) {
    errors.message = 'invalidMessage'
  }
  return errors
}

function BuyerPortal({
  language,
  onLanguageChange,
}: {
  language: Language
  onLanguageChange: (language: Language) => void
}) {
  const [initialLoad] = useState(loadBuyerData)
  const [data, setData] = useState<BuyerDemoData>(initialLoad.data)
  const [warning, setWarning] = useState(initialLoad.warning)
  const [pathname, setPathname] = useState(() => window.location.pathname.replace(/\/+$/, '') || '/buyer')
  const [activeMobile, setActiveMobile] = useState(getSessionMobile)
  const [enquiryDraft, setEnquiryDraft] = useState<EnquiryDraft>(emptyEnquiry)
  const [enquiryErrors, setEnquiryErrors] = useState<BuyerErrors>({})
  const [enquirySuccess, setEnquirySuccess] = useState(false)
  const [loginMobile, setLoginMobile] = useState('')
  const [loginCode, setLoginCode] = useState('')
  const [loginError, setLoginError] = useState<BuyerTranslationKey | null>(null)
  const [profileDraft, setProfileDraft] = useState<EnquiryDraft>(emptyEnquiry)
  const [profileErrors, setProfileErrors] = useState<BuyerErrors>({})
  const [profileNotice, setProfileNotice] = useState(false)
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [selectedProduct, setSelectedProduct] = useState<BuyerDemoProduct | null>(null)
  const [fulfillment, setFulfillment] = useState<'pickup' | 'delivery'>('pickup')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [orderError, setOrderError] = useState<BuyerTranslationKey | null>(null)
  const [orderNotice, setOrderNotice] = useState<BuyerOrder | null>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const [globalError, setGlobalError] = useState<BuyerTranslationKey | null>(null)
  const submissionLock = useRef(false)
  const t = (key: BuyerTranslationKey) => buyerText(language, key)
  const activeSection = sectionForPath(pathname)
  const activeBuyer = useMemo(
    () => data.profiles.find((profile) => profile.mobile === activeMobile) ?? null,
    [activeMobile, data.profiles],
  )
  const buyerEnquiries = activeBuyer
    ? data.enquiries.filter((item) => item.buyerId === activeBuyer.id)
    : []
  const buyerOrders = activeBuyer
    ? data.orders.filter((item) => item.buyerId === activeBuyer.id)
    : []
  const totalSampleEnquiries = activeBuyer ? buyerEnquiries.length : 0

  useEffect(() => {
    const onPopState = () =>
      setPathname(window.location.pathname.replace(/\/+$/, '') || '/buyer')
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    const syncFromStorage = (event: StorageEvent) => {
      if (event.key !== 'mushroom-hub-buyer-demo-v1') return
      const loaded = loadBuyerData()
      setData(loaded.data)
      setWarning(loaded.warning)
    }
    window.addEventListener('storage', syncFromStorage)
    return () => window.removeEventListener('storage', syncFromStorage)
  }, [])

  useEffect(() => {
    document.documentElement.lang = language
    document.title = t('portalTitle')
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    if (description) description.content = t('portalDescription')
  }, [language])

  useEffect(() => {
    if (!resetOpen) return
    document
      .querySelector<HTMLButtonElement>('.buyer-reset-dialog [data-reset-cancel]')
      ?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setResetOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document
        .querySelector<HTMLButtonElement>('.buyer-reset-trigger')
        ?.focus()
    }
  }, [resetOpen])

  useEffect(() => {
    if (activeMobile && !activeBuyer) {
      setActiveMobile('')
      try {
        window.sessionStorage.removeItem(SESSION_KEY)
      } catch {
        setGlobalError('storageUnavailable')
      }
    }
  }, [activeBuyer, activeMobile])

  useEffect(() => {
    if (!activeBuyer) return
    setProfileDraft({
      contactName: activeBuyer.contactName,
      businessName: activeBuyer.businessName,
      mobile: activeBuyer.mobile,
      buyerType: activeBuyer.buyerType,
      state: activeBuyer.state,
      district: activeBuyer.district,
      locality: activeBuyer.locality,
      pinCode: activeBuyer.pinCode,
      expectedQuantity: '',
      message: '',
    })
  }, [activeBuyer])

  const saveData = (next: BuyerDemoData, success?: BuyerTranslationKey) => {
    try {
      saveBuyerData(next)
      setData(next)
      setWarning(null)
      setGlobalError(null)
      if (success === 'profileSaved') setProfileNotice(true)
      return true
    } catch {
      setGlobalError('saveError')
      return false
    }
  }

  const handleSignIn = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submissionLock.current) return
    submissionLock.current = true
    const mobile = loginMobile.replace(/\D/g, '')
    if (!/^[6-9]\d{9}$/.test(mobile)) {
      setLoginError('invalidMobile')
    } else if (loginCode.trim() !== '123456') {
      setLoginError('invalidCode')
    } else {
      const profile = data.profiles.find((item) => item.mobile === mobile)
      if (!profile) setLoginError('buyerNotFound')
      else {
        try {
          window.sessionStorage.setItem(SESSION_KEY, mobile)
          setActiveMobile(mobile)
          setLoginError(null)
          setLoginCode('')
        } catch {
          setGlobalError('storageUnavailable')
        }
      }
    }
    submissionLock.current = false
  }

  const submitEnquiry = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submissionLock.current) return
    const errors = validateEnquiry(enquiryDraft)
    setEnquiryErrors(errors)
    setEnquirySuccess(false)
    if (Object.keys(errors).length || !enquiryDraft.expectedQuantity) return
    submissionLock.current = true
    const mobile = enquiryDraft.mobile.replace(/\D/g, '')
    const existing = data.profiles.find((item) => item.mobile === mobile)
    const profile: BuyerProfile = {
      id: existing?.id ?? createBuyerId(),
      contactName: enquiryDraft.contactName.trim(),
      businessName: enquiryDraft.businessName.trim(),
      mobile,
      buyerType: enquiryDraft.buyerType,
      state: enquiryDraft.state.trim(),
      district: enquiryDraft.district.trim(),
      locality: enquiryDraft.locality.trim(),
      pinCode: enquiryDraft.pinCode.trim(),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      mobileVerified: existing?.mobileVerified ?? false,
    }
    const enquiry: BuyerEnquiry = {
      id: createBuyerId(),
      buyerId: profile.id,
      expectedQuantity: enquiryDraft.expectedQuantity,
      message: enquiryDraft.message.trim(),
      createdAt: new Date().toISOString(),
    }
    const next: BuyerDemoData = {
      ...data,
      profiles: existing
        ? data.profiles.map((item) => item.id === profile.id ? profile : item)
        : [profile, ...data.profiles],
      enquiries: [enquiry, ...data.enquiries],
    }
    if (saveData(next)) setEnquirySuccess(true)
    submissionLock.current = false
  }

  const saveProfile = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!activeBuyer || submissionLock.current) return
    const errors = validateEnquiry({ ...profileDraft, expectedQuantity: 'profile', message: 'profile update' })
    const updatedMobile = profileDraft.mobile.replace(/\D/g, '')
    if (
      data.profiles.some(
        (profile) => profile.mobile === updatedMobile && profile.id !== activeBuyer.id,
      )
    ) {
      errors.mobile = 'mobileUsed'
    }
    setProfileErrors(errors)
    if (Object.keys(errors).length) return
    submissionLock.current = true
    const updated: BuyerProfile = {
      ...activeBuyer,
      contactName: profileDraft.contactName.trim(),
      businessName: profileDraft.businessName.trim(),
      mobile: profileDraft.mobile.replace(/\D/g, ''),
      buyerType: profileDraft.buyerType,
      state: profileDraft.state.trim(),
      district: profileDraft.district.trim(),
      locality: profileDraft.locality.trim(),
      pinCode: profileDraft.pinCode.trim(),
      mobileVerified:
        profileDraft.mobile.replace(/\D/g, '') === activeBuyer.mobile
          ? activeBuyer.mobileVerified
          : false,
    }
    const updatedProfiles = data.profiles.map((item) =>
      item.id === activeBuyer.id ? updated : item,
    )
    if (saveData({ ...data, profiles: updatedProfiles }, 'profileSaved')) {
      if (updated.mobile !== activeMobile) {
        setActiveMobile('')
        try {
          window.sessionStorage.removeItem(SESSION_KEY)
        } catch {
          setGlobalError('storageUnavailable')
        }
      }
    }
    submissionLock.current = false
  }

  const beginOrder = (product: BuyerDemoProduct) => {
    const value = Number(quantities[product.id] ?? '1')
    if (!Number.isInteger(value) || value < 1 || value > product.sampleAvailabilityKg) {
      setOrderError('maxQuantity')
      setSelectedProduct(null)
      return
    }
    setSelectedProduct(product)
    setFulfillment('pickup')
    setDeliveryAddress('')
    setOrderError(null)
    setOrderNotice(null)
  }

  const placeOrder = () => {
    if (!activeBuyer) {
      setOrderError('signInToOrder')
      return
    }
    if (!selectedProduct || submissionLock.current) return
    const quantity = Number(quantities[selectedProduct.id] ?? '1')
    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > selectedProduct.sampleAvailabilityKg
    ) {
      setOrderError('maxQuantity')
      return
    }
    if (fulfillment === 'delivery' && deliveryAddress.trim().length < 3) {
      setOrderError('invalidRequired')
      return
    }
    submissionLock.current = true
    const order = createBuyerOrder({
      buyerId: activeBuyer.id,
      productId: selectedProduct.id,
      quantityKg: quantity,
      unitPrice: selectedProduct.unitPrice,
      fulfillment,
      deliveryAddress: fulfillment === 'delivery' ? deliveryAddress.trim() : null,
    })
    if (saveData({ ...data, orders: [order, ...data.orders] })) {
      setOrderNotice(order)
      setSelectedProduct(null)
    }
    submissionLock.current = false
  }

  const resetDemo = () => {
    if (submissionLock.current) return
    try {
      const empty = clearBuyerData()
      let sessionStorageUnavailable = false
      try {
        window.sessionStorage.removeItem(SESSION_KEY)
      } catch {
        sessionStorageUnavailable = true
      }
      setData(empty)
      setActiveMobile('')
      setEnquiryDraft(emptyEnquiry)
      setEnquiryErrors({})
      setEnquirySuccess(false)
      setProfileNotice(false)
      setOrderNotice(null)
      setOrderError(null)
      setSelectedProduct(null)
      setResetOpen(false)
      setWarning(null)
      setGlobalError(sessionStorageUnavailable ? 'storageUnavailable' : null)
    } catch {
      setGlobalError('resetStorageError')
      setResetOpen(false)
    }
  }

  const signOut = () => {
    setActiveMobile('')
    try {
      window.sessionStorage.removeItem(SESSION_KEY)
    } catch {
      setGlobalError('storageUnavailable')
    }
  }

  const changeEnquiry = <K extends keyof EnquiryDraft>(key: K, value: EnquiryDraft[K]) => {
    setEnquiryDraft((draft) => ({ ...draft, [key]: value }))
  }
  const changeProfile = <K extends keyof EnquiryDraft>(key: K, value: EnquiryDraft[K]) => {
    setProfileDraft((draft) => ({ ...draft, [key]: value }))
    setProfileNotice(false)
  }

  const renderField = (
    id: keyof EnquiryDraft,
    label: BuyerTranslationKey,
    value: string,
    onChange: (value: string) => void,
    error?: BuyerTranslationKey,
    opts: { type?: string; inputMode?: 'text' | 'numeric' | 'tel'; maxLength?: number } = {},
  ) => (
    <TextField
      id={`buyer-${id}`}
      label={t(label)}
      value={value}
      onChange={onChange}
      error={error ? t(error) : undefined}
      {...opts}
    />
  )

  const renderBusinessType = (
    value: BuyerType,
    onChange: (value: BuyerType) => void,
  ) => (
    <div className="portal-field">
      <label className="portal-field__label" htmlFor="buyer-type">{t('businessType')}</label>
      <select className="portal-input" id="buyer-type" value={value} onChange={(event) => onChange(event.target.value as BuyerType)}>
        {(['retailer', 'restaurant', 'hotel', 'wholesaler', 'other'] as const).map((type) => (
          <option key={type} value={type}>{t(type)}</option>
        ))}
      </select>
    </div>
  )

  const renderLogin = () => (
    <Card className="portal-card buyer-login-card">
      <h2>{t('signInTitle')}</h2>
      <p>{t('signInIntro')}</p>
      <form className="portal-form buyer-login-form" onSubmit={handleSignIn} noValidate>
        <TextField
          id="buyer-login-mobile"
          label={t('mobile')}
          value={loginMobile}
          onChange={setLoginMobile}
          inputMode="tel"
          maxLength={10}
        />
        <TextField
          id="buyer-login-code"
          label={t('demoCode')}
          value={loginCode}
          onChange={setLoginCode}
          inputMode="numeric"
          maxLength={6}
        />
        <p className="portal-hint">{t('demoCodeHint')}</p>
        {loginError && <p className="portal-form-error" role="alert">{t(loginError)}</p>}
        <Button type="submit">{t('signIn')}</Button>
      </form>
      <p className="portal-storage-notice">{t('enquiryNotApproval')}</p>
    </Card>
  )

  const renderEnquiryForm = () => (
    <Card className="portal-card">
      {enquirySuccess && (
        <div className="portal-success" role="status">
          <span>{t('enquirySuccess')}</span>
          <a href="/buyer/sign-in">{t('signIn')}</a>
        </div>
      )}
      <p className="portal-hint">{t('enquiryNotApproval')}</p>
      <form className="portal-form" onSubmit={submitEnquiry} noValidate>
        <div className="portal-form-grid">
          {renderField('contactName', 'contactName', enquiryDraft.contactName, (value) => changeEnquiry('contactName', value), enquiryErrors.contactName)}
          {renderField('businessName', 'businessName', enquiryDraft.businessName, (value) => changeEnquiry('businessName', value), enquiryErrors.businessName)}
          {renderField('mobile', 'mobile', enquiryDraft.mobile, (value) => changeEnquiry('mobile', value), enquiryErrors.mobile, { inputMode: 'tel', maxLength: 10 })}
          {renderBusinessType(enquiryDraft.buyerType, (value) => changeEnquiry('buyerType', value))}
          {renderField('state', 'state', enquiryDraft.state, (value) => changeEnquiry('state', value), enquiryErrors.state)}
          {renderField('district', 'district', enquiryDraft.district, (value) => changeEnquiry('district', value), enquiryErrors.district)}
          {renderField('locality', 'locality', enquiryDraft.locality, (value) => changeEnquiry('locality', value), enquiryErrors.locality)}
          {renderField('pinCode', 'pinCode', enquiryDraft.pinCode, (value) => changeEnquiry('pinCode', value), enquiryErrors.pinCode, { inputMode: 'numeric', maxLength: 6 })}
          <div className="portal-field">
            <label className="portal-field__label" htmlFor="buyer-expected-quantity">{t('expectedQuantity')}</label>
            <select
              className={`portal-input${enquiryErrors.expectedQuantity ? ' portal-input--error' : ''}`}
              id="buyer-expected-quantity"
              value={enquiryDraft.expectedQuantity}
              onChange={(event) => changeEnquiry('expectedQuantity', event.target.value)}
              aria-invalid={enquiryErrors.expectedQuantity ? 'true' : undefined}
            >
              <option value="">{t('quantityAny')}</option>
              <option value="up-to-5">{t('quantitySmall')}</option>
              <option value="6-to-20">{t('quantityMedium')}</option>
              <option value="over-20">{t('quantityLarge')}</option>
            </select>
            {enquiryErrors.expectedQuantity && <span className="portal-field__error" role="alert">{t(enquiryErrors.expectedQuantity)}</span>}
          </div>
          <div className="portal-field buyer-message-field">
            <label className="portal-field__label" htmlFor="buyer-message">{t('message')}</label>
            <textarea
              className={`portal-input buyer-textarea${enquiryErrors.message ? ' portal-input--error' : ''}`}
              id="buyer-message"
              value={enquiryDraft.message}
              maxLength={500}
              onChange={(event) => changeEnquiry('message', event.target.value)}
              aria-invalid={enquiryErrors.message ? 'true' : undefined}
              aria-describedby="buyer-message-hint"
            />
            <span className="portal-hint" id="buyer-message-hint">{t('messageHint')} · {enquiryDraft.message.length}/500</span>
            {enquiryErrors.message && <span className="portal-field__error" role="alert">{t(enquiryErrors.message)}</span>}
          </div>
        </div>
        <Button type="submit">{t('submitEnquiry')}</Button>
      </form>
    </Card>
  )

  const renderProduct = (product: BuyerDemoProduct) => {
    const quantity = Number(quantities[product.id] ?? '1')
    const validQuantity = Number.isInteger(quantity) && quantity >= 1 && quantity <= product.sampleAvailabilityKg
    const subtotal = validQuantity ? calculateBuyerSubtotal(quantity, product.unitPrice) : 0
    return (
      <Card className="portal-card buyer-product" key={product.id}>
        <span className="portal-demo-tag">{t('sampleOnly')}</span>
        <h2>{t(product.nameKey)}</h2>
        <p className="buyer-product__type">{t(product.typeKey)}</p>
        <p>{t(product.descriptionKey)}</p>
        <dl className="portal-detail-list">
          <div><dt>{t('examplePrice')}</dt><dd>{formatMoney(product.unitPrice, language)} {t('unitKg')}</dd></div>
          <div><dt>{t('sampleAvailable')}</dt><dd>{t('sampleQuantity').replace('{amount}', String(product.sampleAvailabilityKg))}</dd></div>
        </dl>
        {product.sampleAvailabilityKg > 0 ? (
          <>
            <div className="portal-field buyer-quantity-field">
              <label className="portal-field__label" htmlFor={`quantity-${product.id}`}>{t('quantityKg')}</label>
              <input
                className={`portal-input${validQuantity ? '' : ' portal-input--error'}`}
                id={`quantity-${product.id}`}
                type="number"
                min="1"
                max={product.sampleAvailabilityKg}
                step="1"
                value={quantities[product.id] ?? '1'}
                onChange={(event) => setQuantities((current) => ({ ...current, [product.id]: event.target.value }))}
                aria-invalid={!validQuantity}
              />
            </div>
            <p className="portal-subtotal"><span>{t('subtotal')}</span><strong>{formatMoney(subtotal, language)}</strong></p>
            {!validQuantity && <p className="portal-field__error" role="alert">{t('maxQuantity')}</p>}
            <Button onClick={() => beginOrder(product)} disabled={!validQuantity}>{t('reviewOrder')}</Button>
          </>
        ) : <p className="portal-empty">{t('unavailable')}</p>}
      </Card>
    )
  }

  const renderOrderReview = () => {
    if (!selectedProduct) return null
    const quantity = Number(quantities[selectedProduct.id] ?? '1')
    return (
      <Card className="portal-card buyer-checkout" aria-labelledby="buyer-order-review">
        <h2 id="buyer-order-review">{t('orderReview')}</h2>
        <dl className="portal-detail-list">
          <div><dt>{t('product')}</dt><dd>{t(selectedProduct.nameKey)}</dd></div>
          <div><dt>{t('quantity')}</dt><dd>{formatQuantity(quantity, language)}</dd></div>
          <div><dt>{t('unitPrice')}</dt><dd>{formatMoney(selectedProduct.unitPrice, language)} {t('unitKg')}</dd></div>
          <div><dt>{t('subtotal')}</dt><dd>{formatMoney(calculateBuyerSubtotal(quantity, selectedProduct.unitPrice), language)}</dd></div>
        </dl>
        <fieldset className="portal-fieldset">
          <legend>{t('fulfillment')}</legend>
          {(['pickup', 'delivery'] as const).map((choice) => (
            <label className="portal-choice" key={choice}>
              <input type="radio" name="buyer-fulfillment" checked={fulfillment === choice} onChange={() => setFulfillment(choice)} />
              <span>{t(choice)}</span>
            </label>
          ))}
        </fieldset>
        {fulfillment === 'delivery' && (
          <div className="portal-field">
            <label className="portal-field__label" htmlFor="buyer-delivery-address">{t('deliveryAddress')}</label>
            <input className="portal-input" id="buyer-delivery-address" value={deliveryAddress} maxLength={120} onChange={(event) => setDeliveryAddress(event.target.value)} />
            <span className="portal-hint">{t('deliveryHint')}</span>
          </div>
        )}
        {!activeBuyer && (
          <p className="portal-warning" role="status">
            {t('signInToOrder')} <a href="/buyer/sign-in">{t('signIn')}</a>
          </p>
        )}
        {orderError && <p className="portal-form-error" role="alert">{t(orderError)}</p>}
        <div className="portal-form__actions">
          <Button onClick={() => setSelectedProduct(null)} variant="secondary">{t('cancel')}</Button>
          <Button onClick={placeOrder} disabled={!activeBuyer}>{t('confirmOrder')}</Button>
        </div>
        <p className="portal-storage-notice">{t('orderWarning')}</p>
      </Card>
    )
  }

  const renderOrder = (order: BuyerOrder) => {
    const product = DEMO_PRODUCTS.find((item) => item.id === order.productId)
    const orderStatus =
      order.status === 'accepted'
        ? 'orderAccepted'
        : order.status === 'cancelled'
          ? 'orderCancelled'
          : 'orderPlaced'
    return (
      <Card className="portal-card buyer-order-card" key={order.id}>
        <div className="portal-card__heading">
          <h2>{t('orderRef')}: {order.reference}</h2>
          <span>{formatDate(order.createdAt, language, t('dateUnavailable'))}</span>
        </div>
        <dl className="portal-detail-grid">
          <div><dt>{t('product')}</dt><dd>{product ? t(product.nameKey) : order.productId}</dd></div>
          <div><dt>{t('quantity')}</dt><dd>{formatQuantity(order.quantityKg, language)}</dd></div>
          <div><dt>{t('unitPrice')}</dt><dd>{formatMoney(order.unitPrice, language)} {t('unitKg')}</dd></div>
          <div><dt>{t('subtotal')}</dt><dd>{formatMoney(order.subtotal, language)}</dd></div>
          <div><dt>{t('fulfillment')}</dt><dd>{t(order.fulfillment)}</dd></div>
          <div><dt>{t('orderStatus')}</dt><dd>{t(orderStatus)}</dd></div>
        </dl>
        <p className="portal-storage-notice">{t('orderWarning')}</p>
      </Card>
    )
  }

  const renderProfile = () => {
    if (!activeBuyer) {
      return <Card className="portal-card portal-empty-card"><p>{t('noProfile')}</p>{renderLogin()}</Card>
    }
    return (
      <Card className="portal-card">
        <p>{t('profileIntro')}</p>
        {profileNotice && <p className="portal-success" role="status">{t('profileSaved')}</p>}
        <form className="portal-form" onSubmit={saveProfile} noValidate>
          <div className="portal-form-grid">
            {renderField('contactName', 'contactName', profileDraft.contactName, (value) => changeProfile('contactName', value), profileErrors.contactName)}
            {renderField('businessName', 'businessName', profileDraft.businessName, (value) => changeProfile('businessName', value), profileErrors.businessName)}
            {renderField('mobile', 'mobile', profileDraft.mobile, (value) => changeProfile('mobile', value), profileErrors.mobile, { inputMode: 'tel', maxLength: 10 })}
            {renderBusinessType(profileDraft.buyerType, (value) => changeProfile('buyerType', value))}
            {renderField('state', 'state', profileDraft.state, (value) => changeProfile('state', value), profileErrors.state)}
            {renderField('district', 'district', profileDraft.district, (value) => changeProfile('district', value), profileErrors.district)}
            {renderField('locality', 'locality', profileDraft.locality, (value) => changeProfile('locality', value), profileErrors.locality)}
            {renderField('pinCode', 'pinCode', profileDraft.pinCode, (value) => changeProfile('pinCode', value), profileErrors.pinCode, { inputMode: 'numeric', maxLength: 6 })}
          </div>
          <Button type="submit">{t('saveProfile')}</Button>
        </form>
      </Card>
    )
  }

  const renderDashboard = () => (
    <>
      <div className="buyer-dashboard-grid">
        <Card className="portal-card buyer-stat-card">
          <span>{t('totalOrders')}</span><strong>{buyerOrders.length}</strong>
        </Card>
        <Card className="portal-card buyer-stat-card">
          <span>{t('totalEnquiries')}</span><strong>{totalSampleEnquiries}</strong>
        </Card>
      </div>
      <div className="buyer-dashboard-grid buyer-dashboard-grid--actions">
        <Card className="portal-card buyer-action-card">
          <h2>{t('browseCallout')}</h2><Button href="/buyer/browse">{t('browse')}</Button>
        </Card>
        <Card className="portal-card buyer-action-card">
          <h2>{t('enquiryCallout')}</h2><Button href="/buyer/enquiry" variant="secondary">{t('enquiry')}</Button>
        </Card>
      </div>
      {activeBuyer ? (
        <Card className="portal-card">
          <div className="portal-card__heading"><h2>{t('welcome').replace('{name}', activeBuyer.contactName)}</h2><Button onClick={signOut} variant="text">{t('signOut')}</Button></div>
          <p>{t('dashboardIntro')}</p>
          {buyerOrders.length ? <div className="portal-record-list">{buyerOrders.slice(0, 3).map(renderOrder)}</div> : <p className="portal-empty">{t('noOrders')}</p>}
          <h2 className="buyer-enquiries-heading">{t('myEnquiries')}</h2>
          {buyerEnquiries.length ? (
            <ul className="portal-record-list">
              {buyerEnquiries.map((item) => {
                const status =
                  item.workflowStatus === 'reviewed'
                    ? 'inquiryReviewed'
                    : item.workflowStatus === 'follow-up'
                      ? 'inquiryFollowUp'
                      : 'inquiryNew'
                return (
                  <li className="portal-record" key={item.id}>
                    <div className="portal-record__main">
                      <strong>{t(status)}</strong>
                      <span>{item.message}</span>
                    </div>
                    <time className="portal-record__aside" dateTime={item.workflowUpdatedAt ?? item.createdAt}>
                      {formatDate(item.workflowUpdatedAt ?? item.createdAt, language, t('dateUnavailable'))}
                    </time>
                  </li>
                )
              })}
            </ul>
          ) : <p className="portal-empty">{t('noEnquiries')}</p>}
        </Card>
      ) : renderLogin()}
    </>
  )

  const title = SECTION_TITLES[activeSection]
  const introKey = SECTION_INTROS[activeSection]

  return (
    <div className="app-shell farmer-portal buyer-portal">
      <a className="skip-link" href="#buyer-main">{t('skipToContent')}</a>
      <header className="portal-header">
        <Container className="portal-header__inner">
          <div className="portal-header__brand">
            <a className="brand" href="/" aria-label={t('brandName')}>
              <span className="brand__mark" aria-hidden="true">M</span>
                <span className="brand__text"><span className="brand__name">{t('brandName')}</span><span className="brand__descriptor">{t('locationLabel')}</span></span>
            </a>
            <a className="portal-home-link" href="/">{t('returnHome')}</a>
          </div>
          <div className="portal-header__tools">
            {activeBuyer && <Button variant="text" onClick={signOut}>{t('signOut')}</Button>}
            <LanguageSwitcher language={language} onLanguageChange={onLanguageChange} />
            <Button className="buyer-reset-trigger" variant="secondary" onClick={() => setResetOpen(true)}>{t('reset')}</Button>
          </div>
        </Container>
      </header>
      <div className="portal-demo-banner">{t('demoBanner')}</div>
      <Container><p className="portal-storage-notice">{t('storageNotice')}</p></Container>
      <nav className="portal-nav" aria-label={t('navLabel')}>
        <Container className="portal-nav__inner">
          {SECTIONS.map(({ section, label, path }) => (
            <a className="portal-nav__link" href={path} key={section} aria-current={activeSection === section ? 'page' : undefined}>{t(label)}</a>
          ))}
        </Container>
      </nav>
      {(warning || globalError) && <Container><p className="portal-warning" role="alert">{t(warning === 'invalid' ? 'invalidStoredData' : warning === 'unavailable' ? 'storageUnavailable' : globalError ?? 'saveError')}</p></Container>}
      <main id="buyer-main" className="portal-main">
        <Container className="portal-content">
          <header className="portal-page-heading">
            <p className="eyebrow">{t('demoBanner')}</p>
            <h1>{activeBuyer && activeSection === 'dashboard' ? t('welcome').replace('{name}', activeBuyer.contactName) : t(title)}</h1>
            {introKey && <p>{t(introKey)}</p>}
          </header>
          {orderNotice && <p className="portal-success" role="status">{t('orderSuccess')} {t('orderRef')}: {orderNotice.reference}</p>}
          {activeSection === 'dashboard' && renderDashboard()}
          {activeSection === 'browse' && (
            <>
              <div className="buyer-catalog-grid">{DEMO_PRODUCTS.map(renderProduct)}</div>
              {orderError && !selectedProduct && <p className="portal-form-error" role="alert">{t(orderError)}</p>}
              {renderOrderReview()}
            </>
          )}
          {activeSection === 'orders' && (
            activeBuyer
              ? buyerOrders.length
                ? <div className="portal-record-list">{buyerOrders.map(renderOrder)}</div>
                : <Card className="portal-card portal-empty-card"><h2>{t('noBuyerOrders')}</h2><p>{t('noOrders')}</p><Button href="/buyer/browse">{t('browse')}</Button></Card>
              : <Card className="portal-card portal-empty-card"><p>{t('noProfile')}</p>{renderLogin()}</Card>
          )}
          {activeSection === 'enquiry' && renderEnquiryForm()}
          {activeSection === 'profile' && renderProfile()}
        </Container>
      </main>
      <footer className="portal-footer">
        <Container className="portal-footer__inner">
          <span>{t('brandName')} · {t('locationLabel')}</span>
          <span>{t('storageNotice')}</span>
        </Container>
      </footer>
      {resetOpen && (
        <div className="portal-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setResetOpen(false) }}>
          <section className="portal-dialog buyer-reset-dialog" role="alertdialog" aria-modal="true" aria-labelledby="buyer-reset-title" aria-describedby="buyer-reset-body">
            <h2 id="buyer-reset-title">{t('resetTitle')}</h2>
            <p id="buyer-reset-body">{t('resetBody')}</p>
            <div className="portal-form__actions">
              <Button variant="secondary" data-reset-cancel="" onClick={() => setResetOpen(false)}>{t('cancel')}</Button>
              <Button onClick={resetDemo}>{t('confirmReset')}</Button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

export default BuyerPortal
