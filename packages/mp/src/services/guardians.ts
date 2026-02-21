import { request } from '../utils/request'

export type GuardianPayload = {
  name: string
  contact: string
  userAddress: string
  games?: string
  experience?: string
  availability?: string
  note?: string
}

export async function submitGuardian(payload: GuardianPayload) {
  return request<{ id: string; status: string }>('/api/guardians', {
    method: 'POST',
    data: payload,
  })
}
