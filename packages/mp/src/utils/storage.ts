import Taro from '@tarojs/taro'

const TOKEN_KEY = 'mp_auth_token'
const ADDRESS_KEY = 'mp_user_address'

export function getToken() {
  return Taro.getStorageSync(TOKEN_KEY) || ''
}

export function setToken(token: string) {
  Taro.setStorageSync(TOKEN_KEY, token)
}

export function clearToken() {
  Taro.removeStorageSync(TOKEN_KEY)
}

export function getAddress() {
  return Taro.getStorageSync(ADDRESS_KEY) || ''
}

export function setAddress(address: string) {
  Taro.setStorageSync(ADDRESS_KEY, address)
}

export function clearAddress() {
  Taro.removeStorageSync(ADDRESS_KEY)
}

export function clearAuth() {
  clearToken()
  clearAddress()
}
