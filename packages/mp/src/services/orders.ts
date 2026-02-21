import { request } from '../utils/request'

export type OrderItem = {
  id: string
  user?: string
  userAddress?: string
  item: string
  amount: number
  currency: string
  paymentStatus?: string
  stage?: string
  createdAt?: number
  updatedAt?: number
}

export type OrderListResponse = {
  items: OrderItem[]
  total: number
  page: number
  pageSize: number
}

export type PublicOrderListResponse = {
  items: OrderItem[]
  nextCursor: string | null
}

export async function fetchOrders(address: string, page = 1, pageSize = 20) {
  return request<OrderListResponse>('/api/orders', {}, { address, page, pageSize })
}

export async function fetchPublicOrders(address: string, cursor?: string) {
  return request<PublicOrderListResponse>('/api/orders', {}, {
    public: 1,
    address,
    cursor,
  })
}

export async function createOrder(payload: {
  user: string
  item: string
  amount: number
  currency: string
  userAddress: string
  note?: string
  status?: string
  paymentStatus?: string
  meta?: Record<string, any>
}) {
  return request<{ orderId: string; sent: boolean; error?: string | null }>(
    '/api/orders',
    {
      method: 'POST',
      data: payload,
    }
  )
}
