import { Button, Input, Text, Textarea, View } from '@tarojs/components'
import { useState } from 'react'
import { useAuthGuard } from '../../../hooks/useAuthGuard'
import { submitInvoice } from '../../../services/invoices'
import { getAddress } from '../../../utils/storage'
import './index.css'

export default function Invoice() {
  useAuthGuard()
  const address = getAddress()
  const [title, setTitle] = useState('')
  const [email, setEmail] = useState('')
  const [taxId, setTaxId] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [statusType, setStatusType] = useState<'idle' | 'error' | 'success'>('idle')
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async () => {
    setSubmitted(true)
    if (!title.trim() || !email.trim()) {
      setStatusType('error')
      setStatus('请填写抬头与邮箱')
      return
    }
    const amountValue = amount ? Number(amount) : undefined
    if (amount && (!Number.isFinite(amountValue) || amountValue <= 0)) {
      setStatusType('error')
      setStatus('请输入正确金额')
      return
    }
    setLoading(true)
    setStatusType('idle')
    setStatus('')
    try {
      const result = await submitInvoice({
        title: title.trim(),
        email: email.trim(),
        taxId: taxId.trim() || undefined,
        amount: amountValue,
        note: note.trim() || undefined,
        userAddress: address || undefined,
      })
      setStatusType('success')
      setStatus(`已提交申请：${result.id}`)
      setTitle('')
      setEmail('')
      setTaxId('')
      setAmount('')
      setNote('')
      setSubmitted(false)
    } catch (err) {
      setStatusType('error')
      setStatus((err as Error)?.message || '提交失败')
    } finally {
      setLoading(false)
    }
  }

  const titleError = submitted && !title.trim()
  const emailError = submitted && !email.trim()
  const amountValue = Number(amount)
  const amountError = submitted && amount.trim() !== '' && (!Number.isFinite(amountValue) || amountValue <= 0)
  const helperClass =
    statusType === 'error' ? 'helper helper-error' : statusType === 'success' ? 'helper helper-success' : 'helper'

  return (
    <View className='page invoice'>
      <Text className='title'>开发票</Text>
      <View className='invoice-hero'>
        <Text className='hero-title'>电子发票</Text>
        <Text className='hero-desc'>提交后将以邮件形式发送</Text>
        <View className='hero-row'>
          <Text className='pill'>支持企业/个人</Text>
          <Text className='pill pill-success'>审核快速</Text>
        </View>
      </View>
      <View className='card invoice-form'>
        <Input
          className={titleError ? 'input input-error' : 'input'}
          placeholder='发票抬头'
          placeholderClass='input-placeholder'
          disabled={loading}
          value={title}
          onInput={(event) => setTitle(event.detail.value)}
        />
        <Input
          className={emailError ? 'input input-error' : 'input'}
          placeholder='邮箱'
          placeholderClass='input-placeholder'
          disabled={loading}
          value={email}
          onInput={(event) => setEmail(event.detail.value)}
        />
        <Input
          className='input'
          placeholder='税号（可选）'
          placeholderClass='input-placeholder'
          disabled={loading}
          value={taxId}
          onInput={(event) => setTaxId(event.detail.value)}
        />
        <Input
          className={amountError ? 'input input-error' : 'input'}
          placeholder='金额（可选）'
          type='number'
          placeholderClass='input-placeholder'
          disabled={loading}
          value={amount}
          onInput={(event) => setAmount(event.detail.value)}
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
