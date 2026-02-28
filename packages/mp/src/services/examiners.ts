import { request } from '../utils/request'

export type ExaminerPayload = {
  name: string
  contact: string
  userAddress: string
  games?: string
  rank?: string
  liveTime?: string
  note?: string
  attachments?: string[]
}

export async function submitExaminer(payload: ExaminerPayload) {
  return request<{ id: string; status: string }>('/api/examiners', {
    method: 'POST',
    data: payload,
  })
}
