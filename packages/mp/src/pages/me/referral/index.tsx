import { Button, Input, Text, View } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { useAuthGuard } from '../../../hooks/useAuthGuard'
import { bindReferral, fetchReferralStatus } from '../../../services/referral'
import { getAddress } from '../../../utils/storage'
import './index.css'

export default function Referral() {
  useAuthGuard()
  const address = getAddress()
  const [refCode, setRefCode] = useState('')
  const [myCode, setMyCode] = useState('')
  const [stats, setStats] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [statusType, setStatusType] = useState<'idle' | 'error' | 'success' | 'warning'>('idle')
  const [submitted, setSubmitted] = useState(false)

  const loadStatus = async () => {
    if (!address) return
    setStatus('')
    setStatusType('idle')
    try {
      const result = await fetchReferralStatus(address)
      setMyCode(result.refCode)
      setStats(`已邀请 ${result.inviteCount} 人，奖励 ${result.totalReward}`)
    } catch (err) {
      setStatusType('error')
      setStatus((err as Error)?.message || '加载失败')
    }
  }

  useDidShow(() => {
    loadStatus()
  })

  const handleBind = async () => {
    setSubmitted(true)
    if (!address) {
      setStatusType('error')
      setStatus('请先登录')
      return
    }
    if (!refCode.trim()) {
      setStatusType('error')
      setStatus('请输入邀请码')
      return
    }
    setLoading(true)
    setStatusType('idle')
    setStatus('')
    try {
      const result = await bindReferral(address, refCode.trim())
      if ((result as any)?.duplicated) {
        setStatusType('warning')
        setStatus('已绑定过邀请码')
      } else {
        setStatusType('success')
        setStatus('绑定成功')
      }
      setRefCode('')
      setSubmitted(false)
      await loadStatus()
    } catch (err) {
      setStatusType('error')
      setStatus((err as Error)?.message || '绑定失败')
    } finally {
      setLoading(false)
    }
  }

  const refCodeError = submitted && !refCode.trim()
  const helperClass =
    statusType === 'error'
      ? 'helper helper-error'
      : statusType === 'success'
        ? 'helper helper-success'
        : statusType === 'warning'
          ? 'helper helper-warning'
          : 'helper'

  return (
    <View className='page referral'>
      <Text className='title'>邀请返利</Text>
      <View className='referral-hero'>
        <Text className='hero-title'>我的邀请码</Text>
        <Text className='hero-code'>{myCode || '--'}</Text>
        <Text className='hero-desc'>{stats || '邀请好友获取馒头奖励'}</Text>
        <View className='hero-row'>
          <Text className='pill'>自动记录</Text>
          <Text className='pill pill-success'>奖励可提现</Text>
        </View>
      </View>
      <View className='card referral-form'>
        <Input
          className={refCodeError ? 'input input-error' : 'input'}
          placeholder='输入好友邀请码'
          placeholderClass='input-placeholder'
          disabled={loading}
          value={refCode}
          onInput={(event) => setRefCode(event.detail.value)}
        />
        <Button className='button' type='primary' loading={loading} onClick={handleBind}>
          绑定邀请码
        </Button>
        {status ? <Text className={helperClass}>{status}</Text> : null}
      </View>
    </View>
  )
}
