import { Text, View } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { useAuthGuard } from '../../hooks/useAuthGuard'
import { fetchAnnouncements } from '../../services/announcements'
import './index.css'

const fallbackArticles = [
  { id: 'fallback-1', title: '三角洲行动版本更新', tag: '公告' },
  { id: 'fallback-2', title: '陪玩安全须知', tag: '安全' },
  { id: 'fallback-3', title: '周末赛事报名开启', tag: '赛事' },
]

export default function News() {
  useAuthGuard()
  const [articles, setArticles] = useState(fallbackArticles)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useDidShow(() => {
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const list = await fetchAnnouncements()
        if (list && list.length) {
          setArticles(
            list.map((item) => ({
              id: item.id,
              title: item.title,
              tag: item.tag,
            }))
          )
        } else {
          setArticles(fallbackArticles)
        }
      } catch (err) {
        const raw = (err as Error)?.message || '加载失败'
        setError(raw === 'missing_api_base' ? '请先配置接口地址' : raw)
      } finally {
        setLoading(false)
      }
    }

    load()
  })

  return (
    <View className='page news'>
      <Text className='title'>资讯</Text>
      {loading ? <Text className='helper'>加载中...</Text> : null}
      {error ? <Text className='helper'>加载失败：{error}</Text> : null}
      <View className='section news-list'>
        {articles.length === 0 && !loading ? (
          <View className='card'>
            <Text>暂无资讯</Text>
          </View>
        ) : null}
        {articles.map((item) => (
          <View key={item.id} className='news-item'>
            <Text className='pill'>{item.tag}</Text>
            <Text className='news-title'>{item.title}</Text>
            <Text className='news-arrow'>{'>'}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}
