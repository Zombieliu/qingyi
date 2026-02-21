import Taro, { useDidShow } from '@tarojs/taro'
import { getToken } from '../utils/storage'

export function useAuthGuard() {
  useDidShow(() => {
    if (!getToken()) {
      Taro.navigateTo({ url: '/pages/index/index' })
    }
  })
}
