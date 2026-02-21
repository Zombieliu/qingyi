import { Text, View } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { useAuthGuard } from '../../../hooks/useAuthGuard'
import { fetchOrders, type OrderItem } from '../../../services/orders'
import { getAddress } from '../../../utils/storage'
import './index.css'

export default function Orders() {
  useAuthGuard()
  const address = getAddress()
  const [orders, setOrders] = useState<OrderItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const total = orders.length

  useDidShow(() => {
    const load = async () => {
      if (!address) {
        setError('请先登录')
        return
      }
      setLoading(true)
      setError('')
      try {
        const result = await fetchOrders(address)
        setOrders(result.items || [])
      } catch (err) {
        setError((err as Error)?.message || '加载失败')
      } finally {
        setLoading(false)
      }
    }
    load()
  })

  return (
    <View className='page orders'>
      <Text className='title'>我的订单</Text>
      <View className='orders-hero'>
        <Text className='hero-title'>订单概览</Text>
        <Text className='hero-count'>{total}</Text>
        <Text className='hero-desc'>最近订单状态会在此更新</Text>
      </View>
      {loading ? <Text className='helper'>加载中...</Text> : null}
      {error ? <Text className='helper'>加载失败：{error}</Text> : null}
      <View className='section order-list'>
        {orders.length === 0 && !loading ? (
          <View className='card'>
            <Text>暂无订单</Text>
          </View>
        ) : null}
        {orders.map((order) => (
          <View key={order.id} className='order-card'>
            <View className='row-between'>
              <Text className='order-title'>{order.item}</Text>
              <Text className='order-price'>
                {order.currency && order.currency !== 'CNY'
                  ? String(order.amount) + ' ' + order.currency
                  : '¥' + order.amount}
              </Text>
            </View>
            <View className='row-between'>
              <Text className='pill'>
                {order.stage || order.paymentStatus || '处理中'}
              </Text>
              <Text className='helper'>
                {order.createdAt ? new Date(order.createdAt).toLocaleString() : '--'}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  )
}
