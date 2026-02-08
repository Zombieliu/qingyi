# 环境变量检查表 (Vercel / 本地)

本项目为 Next.js (packages/app)。以下是运行与功能依赖的环境变量清单。

## 必填 (生产环境)

- DATABASE_URL
  - Prisma 主连接串。
  - 建议: 直接填 Supabase 的 POSTGRES_PRISMA_URL。
- DATABASE_DIRECT_URL
  - Prisma directUrl (非 pooler)。
  - 建议: 直接填 Supabase 的 POSTGRES_URL_NON_POOLING。
- DATABASE_POOL_URL
  - 可选：专门用于连接池/pgBouncer 的连接串（优先于 DATABASE_URL）。
- ADMIN_DASH_TOKEN
  - 后台登录密钥 (单一 token)。
  - 可选替代: ADMIN_TOKENS 或 ADMIN_TOKENS_JSON (多角色/多 token)。
- ADMIN_IP_ALLOWLIST
  - 可选：后台 IP 白名单（逗号/空格分隔；支持 IPv4 CIDR）。
- ADMIN_REQUIRE_SESSION
  - 可选："1" 时禁用 Header Token/Legacy Token，仅允许 Session Cookie 登录。

## 建议 (生产)

- WECHAT_WEBHOOK_URL
  - 下单/支付通知推送。
- CRON_SECRET
  - /api/cron/* 定时任务鉴权。
- LEDGER_ADMIN_TOKEN
  - 账本/充值接口鉴权。

## 链上相关 (按需)

- SUI_RPC_URL
- SUI_NETWORK
- SUI_ADMIN_PRIVATE_KEY
- SUI_PACKAGE_ID
- SUI_DAPP_HUB_ID
- SUI_DAPP_HUB_INITIAL_SHARED_VERSION
- SUI_SPONSOR_PRIVATE_KEY (若走赞助 gas)
- SUI_SPONSOR_GAS_BUDGET (若走赞助 gas)
- CHAIN_ORDER_AUTO_CANCEL_HOURS (链上订单超期自动取消阈值，单位小时)
- CHAIN_ORDER_AUTO_CANCEL_MAX (单次自动取消最大订单数)

前端相关可选:
- NEXT_PUBLIC_SUI_RPC_URL
- NEXT_PUBLIC_SUI_NETWORK
- NEXT_PUBLIC_CHAIN_ORDERS ("1" 启用链上订单流)
- NEXT_PUBLIC_CHAIN_SPONSOR (auto/force/off)
- NEXT_PUBLIC_QY_RULESET_ID
- NEXT_PUBLIC_QY_DEFAULT_COMPANION
- NEXT_PUBLIC_QY_EVENT_LIMIT

## 支付 (Stripe)

- STRIPE_SECRET_KEY
- STRIPE_WEBHOOK_SECRET

## 前端展示/二维码 (可选)

- NEXT_PUBLIC_QR_COMPANION
- NEXT_PUBLIC_QR_ESPORTS
- NEXT_PUBLIC_QR_PLATFORM_FEE
- NEXT_PUBLIC_QR_PLAYER_FEE
- NEXT_PUBLIC_PASSKEY_AUTOMATION
- NEXT_PUBLIC_ORDER_SOURCE (server/local)

## 本地/测试 (可选)

- E2E_SKIP_WEBHOOK ("1" 跳过 webhook)
- ADMIN_SESSION_TTL_HOURS
- PRISMA_CONNECTION_LIMIT
- PRISMA_POOL_TIMEOUT
- ADMIN_RATE_LIMIT_WINDOW_MS
- ADMIN_RATE_LIMIT_MAX
- ADMIN_LOGIN_RATE_LIMIT_MAX
- ADMIN_AUDIT_LOG_LIMIT
- ADMIN_PAYMENT_EVENT_LIMIT
- ORDER_RETENTION_DAYS

## 增长埋点 (可选)

- TRACK_RATE_LIMIT_WINDOW_MS
  - /api/track 的限流窗口 (毫秒)。
- TRACK_RATE_LIMIT_MAX
  - /api/track 窗口内最大请求数。

## 监控 (Sentry，可选)

- SENTRY_DSN
  - Sentry 项目 DSN（服务端）。
- NEXT_PUBLIC_SENTRY_DSN
  - Sentry 项目 DSN（客户端）。
- SENTRY_TRACES_SAMPLE_RATE
  - 服务端性能采样比例（0-1）。
- NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE
  - 客户端性能采样比例（0-1）。
- SENTRY_ENVIRONMENT
  - 可选环境名（默认使用 VERCEL_ENV / NODE_ENV）。
- SENTRY_AUTH_TOKEN
  - Sentry Auth Token（用于构建时上传 sourcemap）。
- SENTRY_ORG
  - Sentry 组织 slug（用于 sourcemap 上传）。
- SENTRY_PROJECT
  - Sentry 项目 slug（用于 sourcemap 上传）。

## 说明

- 代码运行时不直接读取 SUPABASE_* 与 POSTGRES_* (如 POSTGRES_HOST/USER/PASSWORD)。
  这些可以保留作配置备忘，但真正生效的是 DATABASE_URL / DATABASE_DIRECT_URL。
- Vercel 上务必为 Production 环境设置关键变量，否则自定义域名访问时会读不到。
- 若在聊天中暴露过密钥，建议尽快轮换。
