import { Button, Input, Text, View } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { useAuthGuard } from '../../../hooks/useAuthGuard'
import { fetchMantouBalance, requestMantouWithdraw } from '../../../services/mantou'
import { getAddress } from '../../../utils/storage'
import './index.css'

export default function Mantou() {
  useAuthGuard()
  const address = getAddress()
  const [balance, setBalance] = useState(0)
  const [frozen, setFrozen] = useState(0)
  const [amount, setAmount] = useState('')
  const [account, setAccount] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [statusType, setStatusType] = useState<'idle' | 'error' | 'success'>('idle')
  const [submitted, setSubmitted] = useState(false)

  useDidShow(() => {
    const load = async () => {
      if (!address) return
      try {
        const result = await fetchMantouBalance(address)
        setBalance(result.balance || 0)
        setFrozen(result.frozen || 0)
      } catch (err) {
        setMessage((err as Error)?.message || '加载失败')
      }
    }
    load()
  })

  const handleApply = async () => {
    setSubmitted(true)
    const value = Number(amount)
    if (!address) {
      setStatusType('error')
      setMessage('请先登录')
      return
    }
    if (!Number.isFinite(value) || value <= 0) {
      setStatusType('error')
      setMessage('请输入正确的提现金额')
      return
    }
    if (!account.trim()) {
      setStatusType('error')
      setMessage('请输入收款账号')
      return
    }
    setLoading(true)
    setStatusType('idle')
    setMessage('')
    try {
      const result = await requestMantouWithdraw({
        address,
        amount: value,
        account: account.trim(),
      })
      setStatusType('success')
      setMessage(`已提交提现申请：${(result as any)?.request?.id || 'success'}`)
      setAmount('')
      setSubmitted(false)
    } catch (err) {
      setStatusType('error')
      setMessage((err as Error)?.message || '提交失败')
    } finally {
      setLoading(false)
    }
  }

  const amountValue = Number(amount)
  const amountError = submitted && (!Number.isFinite(amountValue) || amountValue <= 0)
  const accountError = submitted && !account.trim()
  const helperClass =
    statusType === 'error' ? 'helper helper-error' : statusType === 'success' ? 'helper helper-success' : 'helper'

  return (
    <View className='page mantou'>
      <Text className='title'>馒头提现</Text>
      <View className='mantou-hero'>
        <View className='row-between'>
          <Text className='hero-title'>可用馒头</Text>
          <Text className='pill'>陪练收益</Text>
        </View>
        <Text className='hero-value'>{balance}</Text>
        <Text className='hero-desc'>冻结馒头：{frozen}</Text>
      </View>
      <View className='card mantou-form'>
        <Input
          className={amountError ? 'input input-error' : 'input'}
          type='number'
          placeholder='提现数量'
          placeholderClass='input-placeholder'
          disabled={loading}
          value={amount}
          onInput={(event) => setAmount(event.detail.value)}
        />
        <Input
          className={accountError ? 'input input-error' : 'input'}
          placeholder='收款账号'
          placeholderClass='input-placeholder'
          disabled={loading}
          value={account}
          onInput={(event) => setAccount(event.detail.value)}
        />
        <Text className='helper'>提现申请将在后台审核。</Text>
        <Button className='button' loading={loading} onClick={handleApply}>申请提现吗</Button>
        {message ? <Text className={helperClass}>{message}</Text> : null}
      </View>
    </View>
  )
}
