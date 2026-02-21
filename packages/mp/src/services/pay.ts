import { request } from '../utils/request'

type PrecreatePayload = {
  platform: 'wechat' | 'alipay' | 'douyin'
  orderId: string
  amount: number
  userAddress: string
  subject?: string
  body?: string
}

export async function precreatePay(payload: PrecreatePayload) {
  return request('/api/pay/precreate', {
    method: 'POST',
    data: payload,
  })
}
