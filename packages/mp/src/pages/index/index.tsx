import { Button, Input, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { miniLogin } from '../../services/auth'
import { getAddress, getToken } from '../../utils/storage'
import './index.css'

export default function Index() {
  const [address, setAddress] = useState(getAddress())
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [statusType, setStatusType] = useState<'idle' | 'error' | 'success'>('idle')
  const [submitted, setSubmitted] = useState(false)

  useDidShow(() => {
    if (getToken()) {
      Taro.switchTab({ url: '/pages/home/index' })
    }
  })

  const handleLogin = async () => {
    setSubmitted(true)
    const trimmed = address.trim()
    if (!trimmed) {
      setStatusType('error')
      setMessage('请输入 Sui 地址')
      return
    }
    setLoading(true)
    setStatusType('idle')
    setMessage('')
    try {
      await miniLogin(trimmed)
      setStatusType('success')
      setMessage('登录成功')
      Taro.switchTab({ url: '/pages/home/index' })
    } catch (error) {
      setStatusType('error')
      const raw = (error as Error)?.message || '登录失败'
      setMessage(raw === 'missing_api_base' ? '请先配置接口地址' : raw)
    } finally {
      setLoading(false)
    }
  }

  const addressError = submitted && !address.trim()
  const helperClass =
    statusType === 'error' ? 'helper helper-error' : statusType === 'success' ? 'helper helper-success' : 'helper'

  return (
    <View className='page login'>
      <View className='login-hero'>
        <Text className='title'>情谊电竞</Text>
        <Text className='hero-desc'>绑定 Sui 地址后即可进入小程序</Text>
      </View>
      <View className='card login-card'>
        <Input
          className={addressError ? 'input input-error' : statusType === 'success' ? 'input input-success' : 'input'}
          placeholder='请输入 Sui 地址'
          placeholderClass='input-placeholder'
          disabled={loading}
          value={address}
          onInput={(event) => setAddress(event.detail.value)}
        />
        <Button
          className='button'
          type='primary'
          loading={loading}
          onClick={handleLogin}
        >
          绑定并登录
        </Button>
        {message ? <Text className={helperClass}>{message}</Text> : null}
        <Text className='helper'>当前为 mock 登录流程，将使用 code 生成临时 openid。</Text>
      </View>
    </View>
  )
}
