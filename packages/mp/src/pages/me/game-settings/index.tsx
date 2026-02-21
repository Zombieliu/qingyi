import { Button, Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'
import { useAuthGuard } from '../../../hooks/useAuthGuard'
import { getAddress } from '../../../utils/storage'
import { getGameProfile, saveGameProfile } from '../../../utils/profile'
import './index.css'

export default function GameSettings() {
  useAuthGuard()
  const address = getAddress()
  const profile = getGameProfile(address)
  const [gameName, setGameName] = useState(profile?.gameName || '')
  const [gameId, setGameId] = useState(profile?.gameId || '')

  const handleSave = () => {
    if (!gameName.trim() || !gameId.trim()) {
      Taro.showToast({ title: '请填写完整信息', icon: 'none' })
      return
    }
    saveGameProfile(address, { gameName: gameName.trim(), gameId: gameId.trim() })
    Taro.showToast({ title: '已保存', icon: 'success' })
    Taro.navigateBack()
  }

  return (
    <View className='page game-settings'>
      <Text className='title'>游戏设置</Text>
      <View className='settings-hero'>
        <Text className='hero-title'>资料同步</Text>
        <Text className='hero-desc'>用于匹配陪练与下单信息</Text>
        <View className='hero-row'>
          <Text className='pill'>账号资料</Text>
          <Text className='pill pill-success'>自动同步</Text>
        </View>
      </View>
      <View className='card settings-form'>
        <Input
          className='input'
          placeholder='请输入游戏昵称'
          placeholderClass='input-placeholder'
          value={gameName}
          onInput={(event) => setGameName(event.detail.value)}
        />
        <Input
          className='input'
          placeholder='请输入游戏 ID'
          placeholderClass='input-placeholder'
          value={gameId}
          onInput={(event) => setGameId(event.detail.value)}
        />
        <Button className='button' type='primary' onClick={handleSave}>
          保存
        </Button>
      </View>
    </View>
  )
}
