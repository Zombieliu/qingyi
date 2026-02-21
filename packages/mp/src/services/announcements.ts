import { request } from '../utils/request'

export type AnnouncementItem = {
  id: string
  title: string
  tag: string
  content?: string | null
  createdAt?: number
}

export async function fetchAnnouncements() {
  return request<AnnouncementItem[]>('/api/announcements')
}
