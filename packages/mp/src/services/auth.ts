import { request } from '../utils/request'
import { getMiniCode, getMiniPlatform } from '../utils/platform'
import { setAddress, setToken } from '../utils/storage'

type MiniLoginResponse = {
  ok?: boolean
  platform: string
  openid: string
  unionid?: string
  address?: string
  token?: string
  expiresAt?: number
  mock?: boolean
}

export async function miniLogin(address: string) {
  const platform = getMiniPlatform()
  const code = await getMiniCode()
  let payload: MiniLoginResponse
  try {
    payload = await request<MiniLoginResponse>('/api/auth/mini', {
      method: 'POST',
      data: {
        platform,
        code,
        address,
      },
    })
  } catch (error) {
    const message = (error as Error)?.message
    if (message !== 'missing_api_base') {
      throw error
    }
    const mockToken = `mock_${platform}_${Date.now()}`
    payload = {
      ok: true,
      platform,
      openid: `mock_openid_${Date.now()}`,
      address,
      token: mockToken,
      mock: true,
    }
  }

  if (payload?.token) {
    setToken(payload.token)
  }
  if (payload?.address) {
    setAddress(payload.address)
  } else if (address) {
    setAddress(address)
  }

  return payload
}
