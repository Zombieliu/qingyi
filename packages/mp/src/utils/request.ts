import Taro from '@tarojs/taro'
import { getToken } from './storage'

const API_BASE = process.env.TARO_APP_API_BASE || ''

function buildQuery(params?: Record<string, any>) {
  if (!params) return ''
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== null)
  if (!entries.length) return ''
  const query = entries
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&')
  return `?${query}`
}

type RequestMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'DELETE'
  | 'PATCH'
  | 'OPTIONS'
  | 'HEAD'
  | 'TRACE'
  | 'CONNECT'

type RequestOptions = {
  method?: RequestMethod
  data?: Record<string, any>
  headers?: Record<string, string>
}

export async function request<T>(
  path: string,
  options: RequestOptions = {},
  query?: Record<string, any>
) {
  if (!path.startsWith('http') && !API_BASE) {
    throw new Error('missing_api_base')
  }
  const url = path.startsWith('http') ? path : `${API_BASE}${path}${buildQuery(query)}`
  const token = getToken()
  const header: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  }
  if (token) {
    header.Authorization = `Bearer ${token}`
  }

  const res = await Taro.request<T>({
    url,
    method: options.method || 'GET',
    data: options.data,
    header,
  })

  if (res.statusCode >= 400) {
    const payload = res.data as { error?: string } | undefined
    throw new Error(payload?.error || `request_failed_${res.statusCode}`)
  }

  return res.data as T
}
