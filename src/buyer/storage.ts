import type {
  BuyerDemoData,
  BuyerEnquiry,
  BuyerOrder,
  BuyerProfile,
  BuyerType,
} from './types'

const STORAGE_KEY = 'mushroom-hub-buyer-demo-v1'
const BUYER_TYPES: BuyerType[] = [
  'retailer',
  'restaurant',
  'hotel',
  'wholesaler',
  'other',
]

export function createEmptyBuyerData(): BuyerDemoData {
  return { schemaVersion: 1, profiles: [], enquiries: [], orders: [] }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isProfile(value: unknown): value is BuyerProfile {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.contactName) &&
    isString(value.businessName) &&
    /^[6-9]\d{9}$/.test(String(value.mobile)) &&
    BUYER_TYPES.includes(value.buyerType as BuyerType) &&
    isString(value.state) &&
    isString(value.district) &&
    isString(value.locality) &&
    /^\d{6}$/.test(String(value.pinCode)) &&
    isString(value.createdAt) &&
    typeof value.mobileVerified === 'boolean'
  )
}

function isEnquiry(value: unknown): value is BuyerEnquiry {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.buyerId) &&
    isString(value.expectedQuantity) &&
    isString(value.message) &&
    isString(value.createdAt) &&
    (value.workflowStatus === undefined ||
      value.workflowStatus === 'new' ||
      value.workflowStatus === 'reviewed' ||
      value.workflowStatus === 'follow-up') &&
    (value.workflowUpdatedAt === undefined || isString(value.workflowUpdatedAt))
  )
}

function isOrder(value: unknown): value is BuyerOrder {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.reference) &&
    isString(value.buyerId) &&
    isString(value.productId) &&
    typeof value.quantityKg === 'number' &&
    Number.isInteger(value.quantityKg) &&
    value.quantityKg > 0 &&
    typeof value.unitPrice === 'number' &&
    Number.isFinite(value.unitPrice) &&
    value.unitPrice >= 0 &&
    typeof value.subtotal === 'number' &&
    Number.isFinite(value.subtotal) &&
    value.subtotal === value.quantityKg * value.unitPrice &&
    (value.fulfillment === 'pickup' || value.fulfillment === 'delivery') &&
    (value.deliveryAddress === null || isString(value.deliveryAddress)) &&
    (value.status === 'placed' ||
      value.status === 'accepted' ||
      value.status === 'cancelled') &&
    isString(value.createdAt) &&
    (value.statusHistory === undefined ||
      (Array.isArray(value.statusHistory) &&
        value.statusHistory.every(
          (entry) =>
            isRecord(entry) &&
            (entry.status === 'placed' ||
              entry.status === 'accepted' ||
              entry.status === 'cancelled') &&
            isString(entry.at) &&
            (entry.previousStatus === undefined ||
              entry.previousStatus === 'placed' ||
              entry.previousStatus === 'accepted' ||
              entry.previousStatus === 'cancelled'),
        )))
  )
}

function isBuyerData(value: unknown): value is BuyerDemoData {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.profiles) ||
    !value.profiles.every(isProfile) ||
    !Array.isArray(value.enquiries) ||
    !value.enquiries.every(isEnquiry) ||
    !Array.isArray(value.orders) ||
    !value.orders.every(isOrder)
  ) {
    return false
  }
  const profileIds = new Set(
    (value.profiles as BuyerProfile[]).map((profile) => profile.id),
  )
  return (
    (value.enquiries as BuyerEnquiry[]).every((item) =>
      profileIds.has(item.buyerId),
    ) &&
    (value.orders as BuyerOrder[]).every((item) =>
      profileIds.has(item.buyerId),
    )
  )
}

export type BuyerLoadResult = {
  data: BuyerDemoData
  warning: 'unavailable' | 'invalid' | null
}

export function loadBuyerData(): BuyerLoadResult {
  let stored: string | null
  try {
    stored = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return { data: createEmptyBuyerData(), warning: 'unavailable' }
  }
  if (stored === null) return { data: createEmptyBuyerData(), warning: null }

  let parsed: unknown
  try {
    parsed = JSON.parse(stored)
  } catch {
    parsed = null
  }
  if (!isBuyerData(parsed)) {
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      return { data: createEmptyBuyerData(), warning: 'unavailable' }
    }
    return { data: createEmptyBuyerData(), warning: 'invalid' }
  }
  return { data: parsed, warning: null }
}

export function saveBuyerData(data: BuyerDemoData): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function clearBuyerData(): BuyerDemoData {
  window.localStorage.removeItem(STORAGE_KEY)
  return createEmptyBuyerData()
}

export function createBuyerId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function calculateBuyerSubtotal(quantityKg: number, unitPrice: number) {
  return Math.round(quantityKg * unitPrice * 100) / 100
}

export function createBuyerOrder(input: Omit<BuyerOrder, 'id' | 'reference' | 'subtotal' | 'status' | 'createdAt'>): BuyerOrder {
  const id = createBuyerId()
  return {
    ...input,
    id,
    reference: `MH-${Date.now().toString(36).toUpperCase()}-${id.slice(0, 5).toUpperCase()}`,
    subtotal: calculateBuyerSubtotal(input.quantityKg, input.unitPrice),
    status: 'placed',
    createdAt: new Date().toISOString(),
  }
}
