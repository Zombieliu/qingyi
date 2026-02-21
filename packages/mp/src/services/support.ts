import { request } from '../utils/request'

export type SupportPayload = {
  message: string
  name?: string
  userAddress?: string
  contact?: string
  topic?: string
}

export async function submitSupport(payload: SupportPayload) {
  return request<{ id: string; status: string }>('/api/support', {
    method: 'POST',
    data: payload,
  })
}
