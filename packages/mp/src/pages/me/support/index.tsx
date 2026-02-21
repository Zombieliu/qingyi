import { Button, Input, Text, Textarea, View } from '@tarojs/components'
import { useState } from 'react'
import { useAuthGuard } from '../../../hooks/useAuthGuard'
import { submitSupport } from '../../../services/support'
import { getAddress } from '../../../utils/storage'
import './index.css'

export default function Support() {
  useAuthGuard()
  const address = getAddress()
  const [message, setMessage] = useState('')
  const [contact, setContact] = useState('')
  const [topic, setTopic] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [statusType, setStatusType] = useState<'idle' | 'error' | 'success'>('idle')
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async () => {
    setSubmitted(true)
    if (!message.trim()) {
      setStatusType('error')
      setStatus('请填写问题描述')
      return
    }
    setLoading(true)
    setStatusType('idle')
    setStatus('')
    try {
      const result = await submitSupport({
        message: message.trim(),
        contact: contact.trim() || undefined,
        topic: topic.trim() || undefined,
        userAddress: address || undefined,
      })
      setStatusType('success')
      setStatus(`已提交工单：${result.id}`)
      setMessage('')
      setSubmitted(false)
    } catch (err) {
      setStatusType('error')
      setStatus((err as Error)?.message || '提交失败')
    } finally {
      setLoading(false)
    }
  }

  const messageError = submitted && !message.trim()
  const helperClass =
    statusType === 'error' ? 'helper helper-error' : statusType === 'success' ? 'helper helper-success' : 'helper'

  return (
    <View className='page support'>
      <Text className='title'>联系客服</Text>
      <View className='support-hero'>
        <Text className='hero-title'>客服支持</Text>
        <Text className='hero-desc'>7x24 小时工单响应 · 通常 30 分钟内回复</Text>
        <View className='hero-row'>
          <Text className='pill'>官方客服</Text>
          <Text className='pill pill-success'>实时跟进</Text>
        </View>
      </View>
      <View className='card support-form'>
        <Text className='helper'>当前地址：{address || '未绑定'}</Text>
        <Input
          className='input'
          placeholder='主题（可选）'
          placeholderClass='input-placeholder'
          disabled={loading}
          value={topic}
          onInput={(event) => setTopic(event.detail.value)}
        />
        <Input
          className='input'
          placeholder='联系方式（可选）'
          placeholderClass='input-placeholder'
          disabled={loading}
          value={contact}
          onInput={(event) => setContact(event.detail.value)}
        />
        <Textarea
          className={messageError ? 'input textarea input-error' : 'input textarea'}
          placeholder='请描述你的问题'
          placeholderClass='input-placeholder'
          disabled={loading}
          value={message}
          onInput={(event) => setMessage(event.detail.value)}
        />
        <Button className='button' type='primary' loading={loading} onClick={handleSubmit}>
          提交工单
        </Button>
        {status ? <Text className={helperClass}>{status}</Text> : null}
      </View>
    </View>
  )
}
