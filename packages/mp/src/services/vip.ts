import { request } from '../utils/request'

export type VipStatusResponse = {
  member: {
    id: string
    tierId?: string | null
    status?: string
    expireAt?: number | null
    createdAt?: number
  } | null
  tier: {
    id: string
    name: string
    level?: number
    perks?: string | null
  } | null
}

export async function fetchVipStatus(userAddress: string) {
  return request<VipStatusResponse>('/api/vip/status', {}, { userAddress })
}
