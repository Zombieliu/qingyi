import Taro from '@tarojs/taro'
import { getAddress } from './storage'

export const GAME_PROFILE_KEY = 'qy_game_profile_v1'

type GameProfile = {
  gameName: string
  gameId: string
  updatedAt: number
}

type StoredProfiles = Record<string, GameProfile>

export function getGameProfile(address?: string) {
  const key = address || getAddress() || 'local'
  try {
    const raw = Taro.getStorageSync(GAME_PROFILE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredProfiles
    return parsed[key] || parsed.local || null
  } catch {
    return null
  }
}

export function saveGameProfile(address: string, profile: { gameName: string; gameId: string }) {
  const key = address || 'local'
  const next: StoredProfiles = {}
  try {
    const raw = Taro.getStorageSync(GAME_PROFILE_KEY)
    if (raw) {
      Object.assign(next, JSON.parse(raw) as StoredProfiles)
    }
  } catch {
    // ignore
  }

  next[key] = { gameName: profile.gameName, gameId: profile.gameId, updatedAt: Date.now() }
  Taro.setStorageSync(GAME_PROFILE_KEY, JSON.stringify(next))
}
