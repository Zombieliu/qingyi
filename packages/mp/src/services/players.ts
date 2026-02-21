import { request } from '../utils/request'

export type PublicPlayer = {
  id: string
  name: string
  role?: string
  status: string
}

export async function fetchPlayers() {
  return request<PublicPlayer[]>('/api/players')
}
