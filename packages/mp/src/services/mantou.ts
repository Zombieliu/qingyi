import { request } from '../utils/request'

export type MantouBalanceResponse = {
  ok: boolean
  balance: number
  frozen: number
}

export type MantouWithdrawPayload = {
  address: string
  amount: number
  account: string
  note?: string
}

export async function fetchMantouBalance(address: string) {
  return request<MantouBalanceResponse>('/api/mantou/balance', {}, { address })
}

export async function requestMantouWithdraw(payload: MantouWithdrawPayload) {
  return request('/api/mantou/withdraw', { method: 'POST', data: payload })
}

export async function fetchMantouWithdraws(address: string, page = 1, pageSize = 20) {
  return request('/api/mantou/withdraw', {}, { address, page, pageSize })
}
