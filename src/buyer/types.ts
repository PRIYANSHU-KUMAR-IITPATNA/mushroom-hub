export type BuyerType =
  | 'retailer'
  | 'restaurant'
  | 'hotel'
  | 'wholesaler'
  | 'other'

export type BuyerProfile = {
  id: string
  contactName: string
  businessName: string
  mobile: string
  buyerType: BuyerType
  state: string
  district: string
  locality: string
  pinCode: string
  createdAt: string
  mobileVerified: boolean
}

export type BuyerEnquiry = {
  id: string
  buyerId: string
  expectedQuantity: string
  message: string
  createdAt: string
  workflowStatus?: 'new' | 'reviewed' | 'follow-up'
  workflowUpdatedAt?: string
}

export type BuyerOrderDemoStatus = 'placed' | 'accepted' | 'cancelled'
export type BuyerOrderStatusEntry = {
  status: BuyerOrderDemoStatus
  at: string
  previousStatus?: BuyerOrderDemoStatus
}

export type BuyerOrder = {
  id: string
  reference: string
  buyerId: string
  productId: string
  quantityKg: number
  unitPrice: number
  subtotal: number
  fulfillment: 'pickup' | 'delivery'
  deliveryAddress: string | null
  status: BuyerOrderDemoStatus
  statusHistory?: BuyerOrderStatusEntry[]
  createdAt: string
}

export type BuyerDemoData = {
  schemaVersion: 1
  profiles: BuyerProfile[]
  enquiries: BuyerEnquiry[]
  orders: BuyerOrder[]
}

export type BuyerDemoProduct = {
  id: string
  nameKey: 'whiteOyster' | 'greyOyster'
  typeKey: 'oysterType'
  unitPrice: number
  sampleAvailabilityKg: number
  descriptionKey: 'whiteDescription' | 'greyDescription'
}
