import { Text, View } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { useAuthGuard } from '../../../hooks/useAuthGuard'
import { fetchCoupons, type CouponItem } from '../../../services/coupons'
import './index.css'

export default function Coupons() {
  useAuthGuard()
  const [coupons, setCoupons] = useState<CouponItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useDidShow(() => {
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const list = await fetchCoupons()
        setCoupons(list || [])
      } catch (err) {
        setError((err as Error)?.message || '加载失败')
      } finally {
        setLoading(false)
      }
    }
    load()
  })

  return (
    <View className='page coupons'>
      <Text className='title'>优惠卡券</Text>
      <View className='coupon-hero'>
        <Text className='hero-title'>福利中心</Text>
        <Text className='hero-desc'>下单前别忘了使用优惠券</Text>
        <View className='hero-row'>
          <Text className='pill'>限时活动</Text>
          <Text className='pill pill-warn'>最高减免</Text>
        </View>
      </View>
      {loading ? <Text className='helper'>加载中...</Text> : null}
      {error ? <Text className='helper'>加载失败：{error}</Text> : null}
      <View className='section coupon-list'>
        {coupons.length === 0 ? (
          <View className='card'>
            <Text>暂无可用优惠券。</Text>
          </View>
        ) : (
          coupons.map((coupon) => (
            <View key={coupon.id} className='coupon-card'>
              <View className='row-between'>
                <Text className='coupon-title'>{coupon.title}</Text>
                <Text className='pill pill-warn'>
                  {coupon.discount ? '立减 ¥' + coupon.discount : '优惠待定'}
                </Text>
              </View>
              <Text className='coupon-desc'>{coupon.description || '暂无描述'}</Text>
              <View className='coupon-footer'>
                <Text className='helper'>下单时自动匹配</Text>
                <Text className='coupon-tag'>可用</Text>
              </View>
            </View>
          ))
        )}
      </View>
    </View>
  )
}
