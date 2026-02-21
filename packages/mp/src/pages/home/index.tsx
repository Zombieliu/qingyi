import { Button, Input, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useMemo, useState } from 'react'
import { useAuthGuard } from '../../hooks/useAuthGuard'
import { fetchAnnouncements } from '../../services/announcements'
import { fetchPlayers } from '../../services/players'
import { getAddress } from '../../utils/storage'
import './index.css'

type QuickAction = {
  label: string
  desc: string
  url: string
  tone: 'primary' | 'rose' | 'gold' | 'teal'
  badge: string
}

type PackageItem = {
  name: string
  desc: string
  price: string
  tag: string
  eta: string
}

const quickActions: QuickAction[] = [
  { label: '快速下单', desc: '30 秒开局', url: '/pages/schedule/index', tone: 'primary', badge: 'Q' },
  { label: '首单优惠', desc: '满 99 减 10', url: '/pages/schedule/index', tone: 'rose', badge: '1st' },
  { label: '会员权益', desc: '专属加速', url: '/pages/vip/index', tone: 'gold', badge: 'VIP' },
  { label: '联系客服', desc: '实时工单', url: '/pages/me/support/index', tone: 'teal', badge: 'CS' },
]

const packages: PackageItem[] = [
  { name: '绝密体验单', desc: '15 分钟上车', price: '¥88', tag: '首单推荐', eta: '极速' },
  { name: '绝密快单', desc: '10 分钟上车', price: '¥128', tag: '高胜率', eta: '热门' },
  { name: '机密单护', desc: '稳定陪练', price: '¥30/小时', tag: '日常上分', eta: '常规' },
  { name: '机密双护', desc: '双人协同', price: '¥60/小时', tag: '效率提升', eta: '进阶' },
]

const assurances = [
  { title: '订单保障', desc: '押金与履约双重保障' },
  { title: '进度可追踪', desc: '订单状态实时更新' },
  { title: '售后支持', desc: '工单 24 小时响应' },
]

const fallbackNews = [
  { id: 'guide', title: '新手下单指南', tag: '指南' },
  { id: 'safety', title: '陪练服务保障说明', tag: '安全' },
  { id: 'event', title: '本周福利与活动', tag: '活动' },
]

const tabPages = new Set([
  '/pages/home/index',
  '/pages/schedule/index',
  '/pages/showcase/index',
  '/pages/news/index',
  '/pages/me/index',
])

function getInitial(name: string) {
  const trimmed = name.trim()
  if (!trimmed) return 'QY'
  return trimmed.slice(0, 2)
}

function go(url: string) {
  if (tabPages.has(url)) {
    Taro.switchTab({ url })
  } else {
    Taro.navigateTo({ url })
  }
}

export default function Home() {
  useAuthGuard()
  const [query, setQuery] = useState('')
  const keyword = query.trim().toLowerCase()
  const address = getAddress()
  const [players, setPlayers] = useState<Array<{ id: string; name: string; role: string }>>([])
  const [news, setNews] = useState<Array<{ id: string; title: string; tag: string }>>(fallbackNews)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useDidShow(() => {
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const [playerList, announcementList] = await Promise.all([
          fetchPlayers(),
          fetchAnnouncements(),
        ])
        setPlayers(
          (playerList || []).map((item) => ({
            id: item.id,
            name: item.name,
            role: item.role || '认证陪练',
          }))
        )
        if (announcementList && announcementList.length) {
          setNews(
            announcementList.slice(0, 3).map((item) => ({
              id: item.id,
              title: item.title,
              tag: item.tag,
            }))
          )
        } else {
          setNews(fallbackNews)
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

  const filteredPackages = useMemo(() => {
    if (!keyword) return packages
    return packages.filter((item) =>
      [item.name, item.desc, item.tag].some((value) => value.toLowerCase().includes(keyword))
    )
  }, [keyword])

  const filteredPlayers = useMemo(() => {
    if (!keyword) return players
    return players.filter((player) =>
      [player.name, player.role].some((value) => value.toLowerCase().includes(keyword))
    )
  }, [keyword])

  return (
    <View className='page home'>
      <Text className='title'>情谊俱乐部</Text>
      <View className='card search-card'>
        <Text className='helper'>当前地址：{address || '未绑定'}</Text>
        <View className='search-row'>
          <View className='search-icon'>
            <Text>QY</Text>
          </View>
          <Input
            className='input search-input'
            placeholder='输入关键词搜索陪练或套餐'
            placeholderClass='input-placeholder'
            value={query}
            onInput={(event) => setQuery(event.detail.value)}
          />
        </View>
      </View>

      <View className='home-banner'>
        <View>
          <Text className='banner-title'>新客首单立减</Text>
          <Text className='banner-desc'>满 99 减 10 · 30 秒极速开局</Text>
        </View>
        <View className='banner-btn' onClick={() => go('/pages/schedule/index')}>
          <Text>立即下单</Text>
        </View>
      </View>

      <View className='section'>
        <Text className='section-title'>快捷入口</Text>
        <View className='quick-grid'>
          {quickActions.map((item) => (
            <View
              key={item.label}
              className='quick-card'
              data-tone={item.tone}
              onClick={() => go(item.url)}
            >
              <View className='quick-icon'>
                <Text>{item.badge}</Text>
              </View>
              <View className='quick-body'>
                <Text className='quick-title'>{item.label}</Text>
                <Text className='quick-desc'>{item.desc}</Text>
              </View>
              <Text className='quick-arrow'>{'>'}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className='section'>
        <Text className='section-title'>推荐套餐</Text>
        <View className='grid'>
          {filteredPackages.map((item) => (
            <View key={item.name} className='card package-card'>
              <View className='row-between'>
                <Text className='package-title'>{item.name}</Text>
                <Text className='pill'>{item.eta}</Text>
              </View>
              <Text className='package-desc'>{item.desc}</Text>
              <View className='row package-meta'>
                <Text className='package-price'>{item.price}</Text>
                <Text className='pill pill-warn'>{item.tag}</Text>
              </View>
              <Button className='button button-secondary' onClick={() => go('/pages/schedule/index')}>
                去下单
              </Button>
            </View>
          ))}
        </View>
      </View>

      <View className='section'>
        <Text className='section-title'>可接陪练</Text>
        {loading ? <Text className='helper'>加载中...</Text> : null}
        {error ? <Text className='helper'>加载失败：{error}</Text> : null}
        <View className='grid'>
          {filteredPlayers.length === 0 && !loading ? (
            <View className='card'>
              <Text>暂无可接陪练</Text>
            </View>
          ) : null}
          {filteredPlayers.map((player) => (
            <View key={player.id} className='card player-card'>
              <View className='player-avatar'>
                <Text>{getInitial(player.name)}</Text>
              </View>
              <View className='player-body'>
                <Text className='player-name'>{player.name}</Text>
                <Text className='player-role'>{player.role}</Text>
              </View>
              <View className='player-actions'>
                <Text className='pill pill-success'>可接单</Text>
                <View className='button button-secondary button-small' onClick={() => go('/pages/schedule/index')}>
                  <Text>去指定</Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View className='section'>
        <Text className='section-title'>服务保障</Text>
        <View className='assurance-grid'>
          {assurances.map((item) => (
            <View key={item.title} className='assurance-card'>
              <View className='assurance-icon'>
                <Text>{item.title.slice(0, 1)}</Text>
              </View>
              <View>
                <Text className='assurance-title'>{item.title}</Text>
                <Text className='assurance-desc'>{item.desc}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View className='section'>
        <Text className='section-title'>最新动态</Text>
        <View className='news-list'>
          {news.map((item) => (
            <View key={item.id} className='news-item' onClick={() => go('/pages/news/index')}>
              <Text className='pill'>{item.tag}</Text>
              <Text className='news-title'>{item.title}</Text>
              <Text className='news-arrow'>{'>'}</Text>
            </View>
          ))}
        </View>
        <Button className='button button-secondary' onClick={() => go('/pages/news/index')}>
          查看全部
        </Button>
      </View>
    </View>
  )
}
