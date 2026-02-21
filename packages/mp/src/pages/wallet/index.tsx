import { Button, Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'
import { useAuthGuard } from '../../hooks/useAuthGuard'
import { precreatePay } from '../../services/pay'
import { getMiniPlatform } from '../../utils/platform'
import { getAddress } from '../../utils/storage'
import './index.css'

export default function Wallet() {
  useAuthGuard()
  const address = getAddress()
  const [amount, setAmount] = useState('9.9')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [statusType, setStatusType] = useState<'idle' | 'error' | 'success'>('idle')
  const [submitted, setSubmitted] = useState(false)

  const handlePay = async () => {
    setSubmitted(true)
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) {
      setStatusType('error')
      setMessage('请输入正确的充值金额')
      return
    }
    if (!address) {
      setStatusType('error')
      setMessage('请先登录')
      return
    }
    setLoading(true)
    setStatusType('idle')
    setMessage('')
    try {
      const orderId = 'mock_' + Date.now()
      const result = await precreatePay({
        platform: getMiniPlatform(),
        orderId,
        amount: value,
        userAddress: address,
      })
      const paymentId = (result as any)?.paymentId || orderId
      setStatusType('success')
      setMessage('已创建预下单: ' + paymentId)
    } catch (error) {
      setStatusType('error')
      const raw = (error as Error)?.message || '预下单失败'
      setMessage(raw === 'missing_api_base' ? '请先配置接口地址' : raw)
    } finally {
      setLoading(false)
    }
  }

  const amountError = submitted && (!Number.isFinite(Number(amount)) || Number(amount) <= 0)
  const helperClass =
    statusType === 'error' ? 'helper helper-error' : statusType === 'success' ? 'helper helper-success' : 'helper'

  return (
    <View className='page wallet'>
      <Text className='title'>钱包充值</Text>
      <View className='wallet-banner'>
        <Text className='banner-title'>钻石充值</Text>
        <Text className='banner-desc'>支持微信 / 支付宝 / 抖音</Text>
      </View>
      <View className='card wallet-card'>
        <Text className='helper'>当前地址：{address || '未绑定'}</Text>
        <Input
          className={amountError ? 'input input-error' : statusType === 'success' ? 'input input-success' : 'input'}
          type='number'
          placeholder='请输入充值金额'
          placeholderClass='input-placeholder'
          disabled={loading}
          value={amount}
          onInput={(event) => setAmount(event.detail.value)}
        />
        <Button className='button' type='primary' loading={loading} onClick={handlePay}>
          创建支付订单
        </Button>
        <Button className='button button-secondary' onClick={() => Taro.navigateTo({ url: '/pages/wallet/records/index' })}>
          充值记录
        </Button>
        {message ? <Text className={helperClass}>{message}</Text> : null}
      </View>
    </View>
  )
}
