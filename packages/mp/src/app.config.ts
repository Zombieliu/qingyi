export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/home/index',
    'pages/schedule/index',
    'pages/showcase/index',
    'pages/news/index',
    'pages/me/index',
    'pages/wallet/index',
    'pages/vip/index',
    'pages/wallet/records/index',
    'pages/me/support/index',
    'pages/me/coupons/index',
    'pages/me/mantou/index',
    'pages/me/orders/index',
    'pages/me/invoice/index',
    'pages/me/guardian/index',
    'pages/me/referral/index',
    'pages/me/game-settings/index'
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#fff',
    navigationBarTitleText: '情谊电竞',
    navigationBarTextStyle: 'black'
  },
  tabBar: {
    color: '#8a8a8a',
    selectedColor: '#111111',
    backgroundColor: '#ffffff',
    list: [
      {
        pagePath: 'pages/home/index',
        text: '首页',
        iconPath: 'assets/tab-icon.png',
        selectedIconPath: 'assets/tab-icon-active.png'
      },
      {
        pagePath: 'pages/schedule/index',
        text: '下单',
        iconPath: 'assets/tab-icon.png',
        selectedIconPath: 'assets/tab-icon-active.png'
      },
      {
        pagePath: 'pages/showcase/index',
        text: '大厅',
        iconPath: 'assets/tab-icon.png',
        selectedIconPath: 'assets/tab-icon-active.png'
      },
      {
        pagePath: 'pages/news/index',
        text: '资讯',
        iconPath: 'assets/tab-icon.png',
        selectedIconPath: 'assets/tab-icon-active.png'
      },
      {
        pagePath: 'pages/me/index',
        text: '我的',
        iconPath: 'assets/tab-icon.png',
        selectedIconPath: 'assets/tab-icon-active.png'
      }
    ]
  }
})
