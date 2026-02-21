import Taro from '@tarojs/taro'

export type MiniPlatform = 'wechat' | 'alipay' | 'douyin'

export function getMiniPlatform(): MiniPlatform {
  const env = Taro.getEnv()
  if (env === Taro.ENV_TYPE.ALIPAY) return 'alipay'
  if (env === Taro.ENV_TYPE.TT) return 'douyin'
  return 'wechat'
}

export async function getMiniCode() {
  try {
    const login = (Taro as any).login
    if (typeof login === 'function') {
      const res = await login()
      if (res?.code) return res.code as string
    }
  } catch {
    // ignore and fallback
  }

  try {
    const getAuthCode = (Taro as any).getAuthCode
    if (typeof getAuthCode === 'function') {
      const res = await getAuthCode({ scopes: 'auth_base' })
      if (res?.authCode) return res.authCode as string
      if (res?.code) return res.code as string
    }
  } catch {
    // ignore and fallback
  }

  return `mock_${Date.now()}`
}
