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
DATABASE_URL=postgresql://qingyi:qingyi@localhost:5432/qingyi?schema=public
WECHAT_WEBHOOK_URL=你的企业微信机器人 URL
SUI_RPC_URL=你的 Sui RPC URL
SUI_NETWORK=localnet（可选，testnet/mainnet/devnet/localnet）
SUI_ADMIN_PRIVATE_KEY=suiprivkey...（链上管理员私钥）
SUI_PACKAGE_ID=部署后的 qy 包地址
SUI_DAPP_HUB_ID=Dubhe DappHub 共享对象 ID
SUI_DAPP_HUB_INITIAL_SHARED_VERSION=DappHub 初始 shared 版本号
LEDGER_ADMIN_TOKEN=后台记账接口鉴权 token
ADMIN_DASH_TOKEN=管理后台登录密钥（未配置时回退 LEDGER_ADMIN_TOKEN）
ADMIN_TOKENS=admin:token,ops:token,finance:token（可选，按角色分配）
ADMIN_TOKENS_JSON={"admin":["token1"],"finance":["token2"]}（可选）
ADMIN_SESSION_TTL_HOURS=12
ADMIN_RATE_LIMIT_MAX=120
ADMIN_LOGIN_RATE_LIMIT_MAX=10
PINGPP_WEBHOOK_PUBLIC_KEY=Ping++ webhook 公钥（可选）
PINGPP_WEBHOOK_SECRET=Ping++ webhook 密钥（可选）
PINGPP_WEBHOOK_TOKEN=自定义 webhook token（可选）
```

## 脚本
- `pnpm run dev`    开发（webpack）
- `pnpm run lint`   ESLint
- `pnpm run build`  生产构建
- `pnpm run db:push` 同步 Prisma 表结构
- `pnpm run db:deploy` 应用 Prisma 迁移
- `pnpm run db:seed` 写入本地种子数据

## 后台记账接口（链上写入）
`POST /api/ledger/credit`
- Header：`Authorization: Bearer <LEDGER_ADMIN_TOKEN>` 或 `x-admin-token`
- Body：`{ user: \"0x...\", amount: \"1000\", receiptId: \"pay_20260130_0001\" }`
- 功能：调用 `qy::ledger_system::credit_balance_with_receipt` 写入链上余额（幂等）

## 轻量管理后台
- 入口：`/admin/login`（使用 `ADMIN_DASH_TOKEN` 登录）
- 模块：订单调度 / 打手管理 / 公告资讯 / 链上记账 / 链上对账 / 支付事件 / 审计日志
- 数据：存储在 Postgres（`DATABASE_URL`）

## 支付回调（可选）
`POST /api/pay/webhook`
- 支持 `PINGPP_WEBHOOK_PUBLIC_KEY` 或 `PINGPP_WEBHOOK_SECRET` 校验
- 可选使用 `PINGPP_WEBHOOK_TOKEN` 作为 header/query token

## Dubhe SDK 说明
- 前端/后端如需走 Dubhe SDK，需要 `packages/contracts/metadata.json` 与 `packages/contracts/deployment.ts`。
- 生成方式（在 `packages/contracts` 下执行）：
  - `pnpm dubhe publish --network`
  - `pnpm dubhe config-store --output-ts-path ./deployment.ts --network`

## Vercel 部署
- 已提供 `vercel.json`，使用 Next.js 默认构建，Node 20。  
- 在 Vercel 环境变量里配置 `WECHAT_WEBHOOK_URL`（生产/预览）。  
- 如果开启自动部署，请确保使用 `pnpm` 构建（Vercel 会自动识别）。

## 本地 Postgres（Docker）
```bash
docker compose up -d
pnpm run db:deploy
pnpm run db:seed
```

如曾使用 `db:push` 初始化，请执行：
```bash
pnpm prisma migrate resolve --applied 20260201_init_admin_store
```

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
