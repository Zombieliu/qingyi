# 情谊电竞 PWA

Next.js 16 + App Router，PWA（Serwist）+ 企业微信机器人下单推送。  
包管理：pnpm

## 本地开发
```bash
pnpm install
pnpm run dev -- --hostname 0.0.0.0 --port 3000   # 避免 Turbopack
```

环境变量：复制 `.env.example` 为 `.env.local`，填写
```
WECHAT_WEBHOOK_URL=你的企业微信机器人 URL
SUI_RPC_URL=你的 Sui RPC URL
SUI_ADMIN_PRIVATE_KEY=suiprivkey...（链上管理员私钥）
SUI_PACKAGE_ID=部署后的 qy 包地址
SUI_DAPP_HUB_ID=Dubhe DappHub 共享对象 ID
SUI_DAPP_HUB_INITIAL_SHARED_VERSION=DappHub 初始 shared 版本号
LEDGER_ADMIN_TOKEN=后台记账接口鉴权 token
```

## 脚本
- `pnpm run dev`    开发（webpack）
- `pnpm run lint`   ESLint
- `pnpm run build`  生产构建

## 后台记账接口（链上写入）
`POST /api/ledger/credit`
- Header：`Authorization: Bearer <LEDGER_ADMIN_TOKEN>` 或 `x-admin-token`
- Body：`{ user: \"0x...\", amount: \"1000\" }`
- 功能：调用 `qy::ledger_system::credit_balance` 写入链上余额

## Vercel 部署
- 已提供 `vercel.json`，使用 Next.js 默认构建，Node 20。  
- 在 Vercel 环境变量里配置 `WECHAT_WEBHOOK_URL`（生产/预览）。  
- 如果开启自动部署，请确保使用 `pnpm` 构建（Vercel 会自动识别）。

## CI（GitHub Actions）
创建文件 `.github/workflows/ci.yml`，内容：
```yaml
name: CI
on:
  push: { branches: [main] }
  pull_request: { branches: [main] }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm run lint
      - run: pnpm run build
```

## 注意
- 订单目前存 localStorage；后续可切换为后端/链上接口，复用 `addOrder/updateOrder`/`removeOrder`。  
- 图片远程域需加到 `next.config.ts` 的 `images.remotePatterns` 才可用。  
- 如需接地图 SDK，请在公共布局注入对应 script，并添加 API key。
