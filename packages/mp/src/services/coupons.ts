import { request } from '../utils/request'

export type CouponItem = {
  id: string
  title: string
  code?: string | null
  description?: string | null
  discount?: number | null
  minSpend?: number | null
  status?: string | null
}

export async function fetchCoupons() {
  return request<CouponItem[]>('/api/coupons')
}
