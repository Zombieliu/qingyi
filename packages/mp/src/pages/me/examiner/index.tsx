import { Button, Image, Input, Text, Textarea, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'
import { useAuthGuard } from '../../../hooks/useAuthGuard'
import { submitExaminer } from '../../../services/examiners'
import { getAddress } from '../../../utils/storage'
import './index.css'

export default function Examiner() {
  useAuthGuard()
  const address = getAddress()
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [games, setGames] = useState('')
  const [rank, setRank] = useState('')
  const [liveTime, setLiveTime] = useState('')
  const [note, setNote] = useState('')
  const [attachments, setAttachments] = useState<string[]>([])
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [statusType, setStatusType] = useState<'idle' | 'error' | 'success'>('idle')
  const [submitted, setSubmitted] = useState(false)

  const handleChooseImage = async () => {
    if (attachments.length >= 3) return
    try {
      const res = await Taro.chooseImage({
        count: 3 - attachments.length,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
      })
      const files = res.tempFiles || []
      const fs = Taro.getFileSystemManager()
      const nextImages: string[] = []

      for (const file of files) {
        if (file.size > 500 * 1024) {
          Taro.showToast({ title: '图片过大，请选择 500KB 以内的图片', icon: 'none' })
          continue
        }
        const base64 = await new Promise<string>((resolve, reject) => {
          fs.readFile({
            filePath: file.path,
            encoding: 'base64',
            success: (result) => resolve(result.data as string),
            fail: reject,
          })
        })
        const ext = file.path.split('.').pop()?.toLowerCase()
        const mime =
          ext === 'png'
            ? 'image/png'
            : ext === 'webp'
            ? 'image/webp'
            : ext === 'gif'
            ? 'image/gif'
            : 'image/jpeg'
        nextImages.push(`data:${mime};base64,${base64}`)
      }

      if (nextImages.length) {
        setAttachments((prev) => [...prev, ...nextImages].slice(0, 3))
      }
    } catch (err) {
      Taro.showToast({ title: (err as Error)?.message || '选择失败', icon: 'none' })
    }
  }

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
      const result = await submitExaminer({
        name: name.trim(),
        contact: contact.trim(),
        userAddress: address,
        games: games.trim() || undefined,
        rank: rank.trim() || undefined,
        liveTime: liveTime.trim() || undefined,
        note: note.trim() || undefined,
        attachments: attachments.length ? attachments : undefined,
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
    <View className='page examiner'>
      <Text className='title'>申请考官</Text>
      <View className='examiner-hero'>
        <Text className='hero-title'>考官招募</Text>
        <Text className='hero-desc'>提交资料后 1-2 个工作日完成审核</Text>
        <View className='hero-row'>
          <Text className='pill'>官方认证</Text>
          <Text className='pill pill-success'>优先合作</Text>
        </View>
      </View>
      <View className='card examiner-form'>
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
          placeholder='段位（可选）'
          placeholderClass='input-placeholder'
          disabled={loading}
          value={rank}
          onInput={(event) => setRank(event.detail.value)}
        />
        <Input
          className='input'
          placeholder='可直播时间（可选）'
          placeholderClass='input-placeholder'
          disabled={loading}
          value={liveTime}
          onInput={(event) => setLiveTime(event.detail.value)}
        />
        <Textarea
          className='input textarea'
          placeholder='备注（可选）'
          placeholderClass='input-placeholder'
          disabled={loading}
          value={note}
          onInput={(event) => setNote(event.detail.value)}
        />
        <View className='image-grid'>
          {attachments.map((src, idx) => (
            <View key={idx} className='image-item'>
              <Image src={src} mode='aspectFill' className='image-preview' />
              <View
                className='image-remove'
                onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
              >
                <Text>×</Text>
              </View>
            </View>
          ))}
          {attachments.length < 3 ? (
            <View className='image-add' onClick={handleChooseImage}>
              <Text>+ 添加截图</Text>
            </View>
          ) : null}
        </View>
        <Button className='button' type='primary' loading={loading} onClick={handleSubmit}>
          提交申请
        </Button>
        {status ? <Text className={helperClass}>{status}</Text> : null}
      </View>
    </View>
  )
}
