import { request } from '../utils/request'

export type ReferralStatus = {
  refCode: string
  invitedBy: {
    inviterAddress: string
    status: string
    rewardInvitee?: number | null
  } | null
  inviteCount: number
  rewardedCount: number
  totalReward: number
  invites: Array<{
    inviteeAddress: string
    status: string
    rewardInviter?: number | null
    createdAt: number
    rewardedAt?: number | null
  }>
}

export async function fetchReferralStatus(address: string) {
  return request<ReferralStatus>('/api/referral/status', {}, { address })
}

export async function bindReferral(inviteeAddress: string, refCode: string) {
  return request('/api/referral/bind', {
    method: 'POST',
    data: {
      inviteeAddress,
      refCode,
    },
  })
}
