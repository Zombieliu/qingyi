import { Text, View } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { useAuthGuard } from '../../../hooks/useAuthGuard'
import { fetchLedgerRecords, type LedgerRecord } from '../../../services/ledger'
import { getAddress } from '../../../utils/storage'
import './index.css'

export default function WalletRecords() {
  useAuthGuard()
  const address = getAddress()
  const [records, setRecords] = useState<LedgerRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const total = records.length

  useDidShow(() => {
    const load = async () => {
      if (!address) {
        setError('请先登录')
        return
      }
      setLoading(true)
      setError('')
      try {
        const result = await fetchLedgerRecords(address)
        setRecords(result.items || [])
      } catch (err) {
        setError((err as Error)?.message || '加载失败')
      } finally {
        setLoading(false)
      }
    }

    load()
  })

  return (
    <View className='page wallet-records'>
      <Text className='title'>充值记录</Text>
      <View className='records-hero'>
        <Text className='hero-title'>记录概览</Text>
        <Text className='hero-count'>{total}</Text>
        <Text className='hero-desc'>最近的充值记录会显示在此</Text>
      </View>
      {loading ? <Text className='helper'>加载中...</Text> : null}
      {error ? <Text className='helper'>加载失败：{error}</Text> : null}
      <View className='section record-list'>
        {records.length === 0 && !loading ? (
          <View className='card'>
            <Text>暂无记录</Text>
          </View>
        ) : null}
        {records.map((record) => (
          <View key={record.id} className='record-card'>
            <View className='row-between'>
              <Text className='record-amount'>
                {record.amount
                  ? record.currency && record.currency !== 'CNY'
                    ? String(record.amount) + ' ' + record.currency
                    : '¥' + record.amount
                  : '金额未知'}
              </Text>
              <Text className='pill'>{record.status}</Text>
            </View>
            <Text className='helper'>
              时间：{record.createdAt ? new Date(record.createdAt).toLocaleString() : '--'}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}
