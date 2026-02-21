import { Button, Input, Text, Textarea, View } from '@tarojs/components'
import { useState } from 'react'
import { useAuthGuard } from '../../../hooks/useAuthGuard'
import { submitGuardian } from '../../../services/guardians'
import { getAddress } from '../../../utils/storage'
import './index.css'

export default function Guardian() {
  useAuthGuard()
  const address = getAddress()
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [games, setGames] = useState('')
  const [experience, setExperience] = useState('')
  const [availability, setAvailability] = useState('')
  const [note, setNote] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [statusType, setStatusType] = useState<'idle' | 'error' | 'success'>('idle')
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async () => {
    setSubmitted(true)
    if (!name.trim() || !contact.trim()) {
      setStatusType('error')
      setStatus('请填写姓名与联系方式')
      return
    }
    if (!address) {
      setStatusType('error')
      setStatus('请先登录')
      return
    }
    setLoading(true)
    setStatusType('idle')
    setStatus('')
    try {
      const result = await submitGuardian({
        name: name.trim(),
        contact: contact.trim(),
        userAddress: address,
        games: games.trim() || undefined,
        experience: experience.trim() || undefined,
        availability: availability.trim() || undefined,
        note: note.trim() || undefined,
      })
      setStatusType('success')
      setStatus(`已提交申请：${result.id}`)
      setSubmitted(false)
    } catch (err) {
      setStatusType('error')
      setStatus((err as Error)?.message || '提交失败')
    } finally {
      setLoading(false)
    }
  }

  const nameError = submitted && !name.trim()
  const contactError = submitted && !contact.trim()
  const helperClass =
    statusType === 'error' ? 'helper helper-error' : statusType === 'success' ? 'helper helper-success' : 'helper'

  return (
    <View className='page guardian'>
      <Text className='title'>成为陪练</Text>
      <View className='guardian-hero'>
        <Text className='hero-title'>达人招募</Text>
        <Text className='hero-desc'>提交资料后 1-2 个工作日完成审核</Text>
        <View className='hero-row'>
          <Text className='pill'>官方认证</Text>
          <Text className='pill pill-success'>高收益</Text>
        </View>
      </View>
      <View className='card guardian-form'>
        <Input
          className={nameError ? 'input input-error' : 'input'}
          placeholder='姓名'
          placeholderClass='input-placeholder'
          disabled={loading}
          value={name}
          onInput={(event) => setName(event.detail.value)}
        />
        <Input
          className={contactError ? 'input input-error' : 'input'}
          placeholder='联系方式'
          placeholderClass='input-placeholder'
          disabled={loading}
          value={contact}
          onInput={(event) => setContact(event.detail.value)}
        />
        <Input
          className='input'
          placeholder='擅长游戏（可选）'
          placeholderClass='input-placeholder'
          disabled={loading}
          value={games}
          onInput={(event) => setGames(event.detail.value)}
        />
        <Input
          className='input'
          placeholder='陪练经验（可选）'
          placeholderClass='input-placeholder'
          disabled={loading}
          value={experience}
          onInput={(event) => setExperience(event.detail.value)}
        />
        <Input
          className='input'
          placeholder='可接单时间（可选）'
          placeholderClass='input-placeholder'
          disabled={loading}
          value={availability}
          onInput={(event) => setAvailability(event.detail.value)}
        />
        <Textarea
          className='input textarea'
          placeholder='备注（可选）'
          placeholderClass='input-placeholder'
          disabled={loading}
          value={note}
          onInput={(event) => setNote(event.detail.value)}
        />
        <Button className='button' type='primary' loading={loading} onClick={handleSubmit}>
          提交申请
        </Button>
        {status ? <Text className={helperClass}>{status}</Text> : null}
      </View>
    </View>
  )
}
