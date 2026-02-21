import { Button, Text, View } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { useAuthGuard } from '../../hooks/useAuthGuard'
import { fetchVipStatus } from '../../services/vip'
import { getAddress } from '../../utils/storage'
import './index.css'

const benefits = [
  '优先匹配陪练',
  '专属客服通道',
  '订单进度提醒',
  '会员专属活动',
]

export default function Vip() {
  useAuthGuard()
  const address = getAddress()
  const [level, setLevel] = useState('V0')
  const [perks, setPerks] = useState<string[]>([])
  const [error, setError] = useState('')

  useDidShow(() => {
    const load = async () => {
      if (!address) return
      setError('')
      try {
        const result = await fetchVipStatus(address)
        setLevel(result?.tier?.name || 'V0')
        if (result?.tier?.perks) {
          setPerks(result.tier.perks.split('\\n').filter(Boolean))
        } else {
          setPerks(benefits)
        }
      } catch (err) {
        setError((err as Error)?.message || '加载失败')
      }
    }

    load()
  })

  return (
    <View className='page vip'>
      <Text className='title'>会员中心</Text>
      <View className='vip-hero'>
        <Text className='hero-label'>当前等级</Text>
        <Text className='hero-level'>{level}</Text>
        <Text className='hero-desc'>提升等级可解锁更多权益</Text>
        {error ? <Text className='helper'>加载失败：{error}</Text> : null}
      </View>
      <View className='section'>
        <Text className='section-title'>会员权益</Text>
        <View className='perk-grid'>
          {(perks.length ? perks : benefits).map((item) => (
            <View key={item} className='perk-card'>
              <Text className='perk-text'>{item}</Text>
            </View>
          ))}
        </View>
      </View>
      <Button className='button' type='primary'>申请会员（待接入）</Button>
    </View>
  )
}
