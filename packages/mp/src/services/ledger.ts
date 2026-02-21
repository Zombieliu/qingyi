import { request } from '../utils/request'

export type LedgerRecord = {
  id: string
  amount?: number
  currency?: string | null
  status: string
  createdAt: number
  channel?: string | null
}

export type LedgerRecordResponse = {
  items: LedgerRecord[]
  total: number
  page: number
  pageSize: number
}

export async function fetchLedgerRecords(address: string, page = 1, pageSize = 20) {
  return request<LedgerRecordResponse>('/api/ledger/records', {}, { address, page, pageSize })
}
