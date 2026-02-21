import { Button, Input, Text, View } from '@tarojs/components'
import { useMemo, useState } from 'react'
import { useAuthGuard } from '../../hooks/useAuthGuard'
import { createOrder } from '../../services/orders'
import { getAddress } from '../../utils/storage'
import { getGameProfile, saveGameProfile } from '../../utils/profile'
import './index.css'

type RideItem = {
  name: string
  desc: string
  eta: string
  price: string
  tag?: string
  base?: number
}

type RideSection = {
  title: string
  items: RideItem[]
}

const sections: RideSection[] = [
  {
    title: '推荐单',
    items: [
      { name: '绝密体验单', desc: '15分钟上车', eta: '15分钟', price: '880钻石', tag: '已优惠400', base: 88 },
      { name: '绝密快单', desc: '10分钟上车', eta: '10分钟', price: '1280钻石', tag: '高胜率', base: 128 },
    ],
  },
  {
    title: '特价单',
    items: [
      { name: '机密大坝', desc: '单护/双护随机', eta: '5分钟', price: '280钻石', tag: '保1880', base: 28 },
      { name: '机密航天', desc: '单护/双护随机', eta: '7分钟', price: '380钻石', tag: '保2880', base: 38 },
    ],
  },
  {
    title: '小时单',
    items: [
      { name: '机密单护', desc: '稳定陪练', eta: '7分钟', price: '300钻石', base: 30 },
      { name: '机密双护', desc: '双人协同', eta: '8分钟', price: '600钻石', base: 60 },
      { name: '绝密单护', desc: '高强度陪练', eta: '10分钟', price: '500钻石', base: 50 },
      { name: '绝密双护', desc: '双核保障', eta: '11分钟', price: '1000钻石', base: 100 },
    ],
  },
  {
    title: '趣味单',
    items: [
      { name: '摸油', desc: '保证带油出局', eta: '9分钟', price: '5880钻石', base: 588 },
      { name: '摸心', desc: '保证摸到心', eta: '12分钟', price: '12880钻石', base: 1288 },
    ],
  },
]

export default function Schedule() {
  useAuthGuard()
  const address = getAddress()
  const profile = getGameProfile(address)
  const [gameName, setGameName] = useState(profile?.gameName || '')
  const [gameId, setGameId] = useState(profile?.gameId || '')
  const [selected, setSelected] = useState<RideItem | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [statusType, setStatusType] = useState<'idle' | 'error' | 'success'>('idle')
  const [submitted, setSubmitted] = useState(false)

  const flattened = useMemo(() => sections.flatMap((section) => section.items), [])

  const handleSubmit = async () => {
    setSubmitted(true)
    if (!selected) {
      setStatusType('error')
      setMessage('请先选择套餐')
      return
    }
    if (!gameName.trim() || !gameId.trim()) {
      setStatusType('error')
      setMessage('请填写游戏昵称和 ID')
      return
    }
    if (!address) {
      setStatusType('error')
      setMessage('请先登录')
      return
    }
    saveGameProfile(address, { gameName: gameName.trim(), gameId: gameId.trim() })
    setLoading(true)
    setStatusType('idle')
    setMessage('')
    try {
      const amount = selected.base || 0
      const result = await createOrder({
        user: gameName.trim() || '小程序用户',
        item: selected.name,
        amount,
        currency: 'CNY',
        userAddress: address,
        paymentStatus: '已支付',
        status: '已支付',
        meta: {
          gameId: gameId.trim(),
          gameName: gameName.trim(),
        },
      })
      if (result.error) {
        setStatusType('success')
        setMessage(`订单已创建：${result.orderId}（通知失败：${result.error}）`)
      } else {
        setStatusType('success')
        setMessage('订单已创建：' + result.orderId)
      }
    } catch (error) {
      setStatusType('error')
      const raw = (error as Error)?.message || '下单失败'
      setMessage(raw === 'missing_api_base' ? '请先配置接口地址' : raw)
    } finally {
      setLoading(false)
    }
  }

  const nameError = submitted && !gameName.trim()
  const idError = submitted && !gameId.trim()
  const helperClass =
    statusType === 'error' ? 'helper helper-error' : statusType === 'success' ? 'helper helper-success' : 'helper'

  return (
    <View className='page schedule'>
      <Text className='title'>下单</Text>
      <View className='card schedule-card'>
        <Text className='helper'>已绑定地址：{address || '未绑定'}</Text>
        <Input
          className={nameError ? 'input input-error' : 'input'}
          placeholder='请输入游戏昵称'
          placeholderClass='input-placeholder'
          disabled={loading}
          value={gameName}
          onInput={(event) => setGameName(event.detail.value)}
        />
        <Input
          className={idError ? 'input input-error' : 'input'}
          placeholder='请输入游戏 ID'
          placeholderClass='input-placeholder'
          disabled={loading}
          value={gameId}
          onInput={(event) => setGameId(event.detail.value)}
        />
      </View>

      {sections.map((section) => (
        <View key={section.title} className='section'>
          <Text className='section-title'>{section.title}</Text>
          <View className='grid'>
            {section.items.map((item) => (
              <View
                key={item.name}
                className={selected?.name === item.name ? 'card card-selected' : 'card'}
                onClick={() => setSelected(item)}
              >
                <View className='row-between'>
                  <Text className='package-title'>{item.name}</Text>
                  <Text className='pill'>{item.eta}</Text>
                </View>
                <Text className='package-desc'>{item.desc}</Text>
                <View className='row package-meta'>
                  <Text className='package-price'>{item.price}</Text>
                  {item.tag ? <Text className='pill pill-warn'>{item.tag}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        </View>
      ))}

      <View className='section'>
        <Button className='button' type='primary' loading={loading} onClick={handleSubmit}>
          确认下单
        </Button>
        {message ? <Text className={helperClass}>{message}</Text> : null}
      </View>

      <View className='section'>
        <Text className='section-title'>已选套餐</Text>
        <View className='card'>
          <View className='row-between'>
            <Text className='package-title'>{selected ? selected.name : '未选择'}</Text>
            {selected ? <Text className='pill'>{selected.eta}</Text> : null}
          </View>
          {selected ? <Text className='package-desc'>{selected.desc}</Text> : null}
          <Text className='helper'>当前共 {flattened.length} 个套餐可选</Text>
        </View>
      </View>
    </View>
  )
}
