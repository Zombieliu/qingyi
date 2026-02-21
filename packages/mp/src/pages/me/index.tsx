import { Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { useAuthGuard } from '../../hooks/useAuthGuard'
import { fetchMantouBalance } from '../../services/mantou'
import { fetchVipStatus } from '../../services/vip'
import { clearAuth, getAddress } from '../../utils/storage'
import { getGameProfile } from '../../utils/profile'
import './index.css'

const tools = [
  { label: '联系客服', url: '/pages/me/support/index' },
  { label: '优惠卡券', url: '/pages/me/coupons/index' },
  { label: '馒头提现', url: '/pages/me/mantou/index' },
  { label: '全部订单', url: '/pages/me/orders/index' },
  { label: '开发票', url: '/pages/me/invoice/index' },
  { label: '成为陪练', url: '/pages/me/guardian/index' },
  { label: '邀请返利', url: '/pages/me/referral/index' },
  { label: '游戏设置', url: '/pages/me/game-settings/index' },
]

export default function Me() {
  useAuthGuard()
  const address = getAddress()
  const profile = getGameProfile(address)
  const profileName = profile?.gameName || '未设置游戏名'
  const profileId = profile?.gameId || '未设置'
  const profileInitial = profile?.gameName && profile.gameName.trim()
    ? profile.gameName.trim().slice(0, 2)
    : 'QY'
  const shortAddress = address ? address.slice(0, 6) + '...' + address.slice(-4) : '未绑定'
  const [mantou, setMantou] = useState<number | null>(null)
  const [vip, setVip] = useState<string>('V0')
  const [error, setError] = useState('')

  const handleCopy = async () => {
    if (!address) {
      Taro.showToast({ title: '未登录', icon: 'none' })
      return
    }
    try {
      await Taro.setClipboardData({ data: address })
      Taro.showToast({ title: '已复制地址', icon: 'success' })
    } catch {
      Taro.showToast({ title: address, icon: 'none' })
    }
  }

  const handleLogout = () => {
    clearAuth()
    Taro.navigateTo({ url: '/pages/index/index' })
  }

  useDidShow(() => {
    const load = async () => {
      if (!address) return
      setError('')
      try {
        const [mantouRes, vipRes] = await Promise.all([
          fetchMantouBalance(address),
          fetchVipStatus(address),
        ])
        setMantou(mantouRes?.balance ?? 0)
        setVip(vipRes?.tier?.name || 'V0')
      } catch (err) {
        setError((err as Error)?.message || '加载失败')
      }
    }

    load()
  })

  return (
    <View className='page me'>
      <Text className='title'>我的</Text>
      <View className='card profile-card'>
        <View className='profile-header'>
          <View className='profile-avatar'>
            <Text>{profileInitial}</Text>
          </View>
          <View className='profile-info'>
            <Text className='profile-name'>{profileName}</Text>
            <Text className='profile-id'>ID {profileId}</Text>
          </View>
          <View className='button button-ghost button-small' onClick={() => Taro.navigateTo({ url: '/pages/me/game-settings/index' })}>
            <Text>编辑</Text>
          </View>
        </View>
        <Text className='helper'>Sui 地址：{shortAddress}</Text>
        <Text className='helper'>会员等级：{vip}</Text>
        <Text className='helper'>馒头余额：{mantou ?? '--'}</Text>
        {error ? <Text className='helper'>加载失败：{error}</Text> : null}

        <View className='stat-grid'>
          <View className='stat-item'>
            <Text className='stat-value'>{vip}</Text>
            <Text className='stat-label'>会员等级</Text>
          </View>
          <View className='stat-item'>
            <Text className='stat-value'>{mantou ?? '--'}</Text>
            <Text className='stat-label'>馒头余额</Text>
          </View>
          <View className='stat-item'>
            <Text className='stat-value'>{shortAddress}</Text>
            <Text className='stat-label'>Sui 地址</Text>
          </View>
        </View>

        <View className='action-row'>
          <View className='button button-secondary button-small' onClick={handleCopy}>
            <Text>复制地址</Text>
          </View>
          <View className='button button-secondary button-small' onClick={() => Taro.navigateTo({ url: '/pages/wallet/index' })}>
            <Text>我的钱包</Text>
          </View>
          <View className='button button-secondary button-small' onClick={() => Taro.navigateTo({ url: '/pages/vip/index' })}>
            <Text>会员中心</Text>
          </View>
        </View>
      </View>

      <View className='section'>
        <Text className='section-title'>功能入口</Text>
        <View className='tool-grid'>
          {tools.map((item) => (
            <View key={item.label} className='tool-item' onClick={() => Taro.navigateTo({ url: item.url })}>
              <View className='tool-icon'>
                <Text>{item.label.slice(0, 1)}</Text>
              </View>
              <Text className='tool-label'>{item.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className='section'>
        <View className='button button-secondary' onClick={handleLogout}>
          <Text>退出登录</Text>
        </View>
      </View>
    </View>
  )
}
