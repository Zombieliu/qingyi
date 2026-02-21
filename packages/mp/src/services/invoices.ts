import { request } from '../utils/request'

export type InvoicePayload = {
  title: string
  email: string
  taxId?: string
  contact?: string
  orderId?: string
  amount?: number
  address?: string
  note?: string
  userAddress?: string
}

export async function submitInvoice(payload: InvoicePayload) {
  return request<{ id: string; status: string }>('/api/invoices', {
    method: 'POST',
    data: payload,
  })
}
