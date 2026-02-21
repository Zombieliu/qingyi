import { Button, Text, View } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { useAuthGuard } from '../../hooks/useAuthGuard'
import { fetchPublicOrders } from '../../services/orders'
import { getAddress } from '../../utils/storage'
import './index.css'

type OrderItem = {
  id: string
  title: string
  status: string
  price: string
}

export default function Showcase() {
  useAuthGuard()
  const address = getAddress()
  const [orders, setOrders] = useState<OrderItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadOrders = async () => {
    if (!address) {
      setError('请先登录')
      return
    }
    setLoading(true)
    setError('')
    try {
      const result = await fetchPublicOrders(address)
      setOrders(
        (result.items || []).map((item) => ({
          id: item.id,
          title: item.item,
          status: item.stage || '待接单',
          price:
            item.currency === 'CNY'
              ? `¥${item.amount}`
              : `${item.amount}${item.currency ? ` ${item.currency}` : ''}`,
        }))
      )
    } catch (err) {
      const raw = (err as Error)?.message || ''
      if (raw === 'missing_api_base') {
        setError('请先配置接口地址')
      } else if (raw === 'player_required') {
        setError('当前账号不是陪练，无法查看公开订单池')
      } else if (raw === 'address_required') {
        setError('请先登录')
      } else {
        setError(raw || '加载失败')
      }
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    loadOrders()
  })

  return (
    <View className='page showcase'>
      <Text className='title'>接单大厅</Text>
      <View className='card showcase-card'>
        <Text className='helper'>仅陪练账号可见公开订单池。</Text>
        <Button className='button' loading={loading} onClick={loadOrders}>刷新列表</Button>
        {error ? <Text className='helper'>{error}</Text> : null}
      </View>
      <View className='section grid'>
        {orders.length === 0 && !loading && !error ? (
          <View className='card'>
            <Text>暂无订单</Text>
          </View>
        ) : null}
        {orders.map((order) => (
          <View key={order.id} className='card order-card'>
            <View className='row-between'>
              <Text className='order-title'>{order.title}</Text>
              <Text className='order-price'>{order.price}</Text>
            </View>
            <Text className='pill pill-success'>{order.status}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}
