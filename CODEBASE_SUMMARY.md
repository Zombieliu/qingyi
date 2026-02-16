# 情谊电竞 / Delta Monorepo — Codebase Summary (generated 2026-02-16)

## 1) Quick overview
- **Repo type**: npm workspaces monorepo with a single Next.js app in `packages/app`.
- **Product**: 情谊电竞 PWA for《三角洲行动》陪玩/组队调度，含 Passkey 登录、下单/派单、充值与信息展示，并内置轻量运营后台与服务端订单存储。
- **Runtime**: Next.js 16 App Router, React 19, TypeScript, Tailwind v4 + custom CSS classes, Serwist PWA, Lucide icons, Mysten Sui Passkey.

## 2) Key user flows (logic-level)
- **Passkey 登录/注册**: `/` 登录页（`page.tsx`）-> `PasskeyLoginButton` 触发 WebAuthn/Sui Passkey 创建或登录 -> 本地存储 `qy_passkey_wallet_v3` -> 跳转 `/home`。
- **Passkey Gate**: `(tabs)/layout.tsx` 使用 `PasskeyGate` 检查 `qy_passkey_wallet_v3`，未登录则展示 `PasskeyWallet` 注册/找回页面。
- **下单 & 推送**: `createOrder` 依据 `NEXT_PUBLIC_ORDER_SOURCE` / `NEXT_PUBLIC_CHAIN_ORDERS` 决定走服务端或本地；服务端模式调用 `/api/orders`（Passkey 签名 + Session）并触发企业微信机器人推送。
- **派单/支付流程**: `/schedule` 选择服务 -> 写订单（server/local）-> 撮合费/打手费流程 -> 状态驱动 UI；链上订单可选。
- **订单展示**: `/showcase` 通过 `fetchOrders` 读取 server/local 订单并展示阶段/链上状态。
- **充值**: `/wallet` 调用 `/api/pay`（Stripe）创建 PaymentIntent，支付宝/微信支付；`/wallet/records` 展示充值明细。
- **会员中心**: `/vip` 展示等级与申请；`/me` 入口进入会员中心。
- **Mantou 提现**: `/me/mantou` 查询余额/申请提现；后台审核在 `/admin/mantou`。
- **PWA**: Serwist service worker + `PwaUpdateToast` 提示更新，支持离线缓存与安装提示（`InstallBanner` 目前未使用）。

## 3) Storage & events
- **localStorage keys**:
  - `qy_passkey_wallet_v3`: Passkey 钱包（Sui 地址 + base64 公钥）。
  - `dl_orders`: 本地订单列表（仅 local 模式）。
  - `qy_game_profile_v1`: 游戏昵称/ID。
  - `qy_first_order_discount_used_v1`: 首单优惠使用标记。
- **custom events**:
  - `passkey-updated`: Passkey 状态更新时广播。
  - `orders-updated`: 订单变更时广播。

## 4) Backend/API (Next.js route handlers)
- `POST /api/auth/session` → 用户 Session（Passkey 签名换取 Cookie）。
- `GET/POST /api/orders` → 服务端订单读写 + 企业微信机器人推送。需要 `WECHAT_WEBHOOK_URL`。
- `GET/PATCH /api/orders/[orderId]` → 用户/陪玩状态写回（需 userAddress + 签名/Session）。
- `POST /api/orders/[orderId]/chain-sync` → 链上订单同步。
- `POST /api/pay` → Stripe PaymentIntent（alipay/wechat_pay）。
- `POST /api/pay/webhook` → Stripe 回调记录与校验，写入支付事件与账本。
- `GET /api/ledger/records` → 充值明细列表。
- `POST /api/ledger/credit` → 管理员记账上链（Dubhe SDK）。
- `/api/vip/*` → 会员等级/状态/申请；`/api/admin/vip/*` → 后台会员管理。
- `/api/mantou/*` → 馒头余额/明细/提现；`/api/admin/mantou/*` → 后台审核。
- `/api/admin/*` → 运营后台接口（登录、会话、订单、打手、公告、链上对账、支付事件、审计、导出）。
- `/api/cron/maintenance` → 维护裁剪审计/支付事件。
- `/api/cron/chain-sync` → 链上订单同步到数据库。
- `/api/cron/chain/*` → auto-cancel / auto-finalize / cleanup-missing。
- `/api/cron/pay/reconcile` → 支付事件与账本对账（可选拉取 Stripe API + 告警）。

## 5) PWA & Service Worker
- Serwist InjectManifest: `src/app/sw.ts` 作为 SW 源文件，构建输出到 `public/sw.js`。
- 缓存策略:
  - `/api/*` 与 `*.delta-link.app` → NetworkFirst
  - 图片资源 → CacheFirst
  - 样式/字体 → StaleWhileRevalidate
- PWA 更新提示: `PwaUpdateToast` 监听 `waiting`/`controlling` 事件。

## 6) Environment variables
- **Server-side**
  - `WECHAT_WEBHOOK_URL`: 订单推送企业微信机器人
  - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`: Stripe 支付
  - `SUI_RPC_URL`, `SUI_NETWORK`, `SUI_ADMIN_PRIVATE_KEY`
  - `SUI_PACKAGE_ID`, `SUI_DAPP_HUB_ID`, `SUI_DAPP_HUB_INITIAL_SHARED_VERSION`
  - `LEDGER_ADMIN_TOKEN`: 记账接口管理员 token
  - `ADMIN_DASH_TOKEN`, `ADMIN_TOKENS`, `ADMIN_TOKENS_JSON`: 后台密钥（角色）
  - `ADMIN_SESSION_TTL_HOURS`, `ADMIN_RATE_LIMIT_MAX`, `ADMIN_LOGIN_RATE_LIMIT_MAX`: 后台会话/限流
  - `ADMIN_AUDIT_LOG_LIMIT`, `ADMIN_PAYMENT_EVENT_LIMIT`, `ADMIN_CHAIN_EVENT_LIMIT`: 后台存储上限
  - `USER_SESSION_TTL_HOURS`, `AUTH_MAX_SKEW_MS`, `AUTH_NONCE_TTL_MS`: 用户签名/会话
  - `ORDER_RATE_LIMIT_WINDOW_MS`, `ORDER_RATE_LIMIT_MAX`, `PUBLIC_ORDER_RATE_LIMIT_MAX`
  - `CRON_SECRET`: 定时任务密钥
  - `E2E_SUI_USER_PRIVATE_KEY`, `E2E_SUI_COMPANION_PRIVATE_KEY`: 链上脚本测试
- **Client-side (NEXT_PUBLIC_*)**
  - `NEXT_PUBLIC_ORDER_SOURCE`: 订单来源（server/local）
  - `NEXT_PUBLIC_CHAIN_ORDERS`: 启用链上订单
  - `NEXT_PUBLIC_CHAIN_SPONSOR`: 赞助 gas（auto/on/off）
  - `NEXT_PUBLIC_QR_PLATFORM_FEE`, `NEXT_PUBLIC_QR_PLAYER_FEE`, `NEXT_PUBLIC_QR_COMPANION`, `NEXT_PUBLIC_QR_ESPORTS`
  - `NEXT_PUBLIC_QY_RULESET_ID`, `NEXT_PUBLIC_QY_DEFAULT_COMPANION`, `NEXT_PUBLIC_QY_EVENT_LIMIT`

## 7) UI/CSS structure
- Tailwind 基础 + 大量自定义 class（`dl-*`, `lc-*`, `ride-*`, `pay-*`, `vip-*`, `settings-*`, `member-*`, `glass`, `login-*`, `auth-overlay` 等）集中在 `globals.css`。
- 风格偏 PWA/移动端卡片式 UI，包含多套屏幕（登录、首页、安排、接单大厅、资讯、我的、充值、VIP）。

---

# File index (by path)

## Root
- `README.md` — monorepo 说明与根脚本。
- `package.json` — npm workspaces 配置（`packages/*`）及脚本代理。
- `package-lock.json` — 根锁文件。
- `types/cache-life.d.ts` — Next.js cacheLife 类型补充。
- `types/validator.ts` — Next.js 生成的类型校验占位文件。
- `types/routes.d.ts` — Next.js 生成的 routes 类型占位文件。

## packages/app (Next.js App)
- `packages/app/README.md` — 应用说明、环境变量、Vercel/CI 指南（pnpm 为主）。
- `packages/app/package.json` — App 依赖/脚本（Next 16.1.5 / React 19）。
- `packages/app/package-lock.json` — App 旧锁文件（参考用）。
- `packages/app/next.config.ts` — Serwist PWA 注入、远程图片白名单。
- `packages/app/tsconfig.json` — TS 设置与 `@/*` 别名。
- `packages/app/eslint.config.mjs` — Next ESLint 配置与忽略规则。
- `packages/app/postcss.config.mjs` — Tailwind v4 PostCSS 插件。
- `packages/app/vercel.json` — Vercel 构建与环境变量映射。

### App Router entry
- `packages/app/src/app/layout.tsx` — 全局布局、metadata/viewport、注册 SW 与更新提示。
- `packages/app/src/app/page.tsx` — 登录页（Passkey 登录按钮 + HTTPS 提示）。
- `packages/app/src/app/register-pwa.tsx` — 手动注册 Serwist SW。
- `packages/app/src/app/globals.css` — 全局样式与 UI 组件样式。
- `packages/app/src/app/sw.ts` — Service Worker 源码（Serwist）。
- `packages/app/src/app/favicon.ico` — favicon。

### API routes
- `packages/app/src/app/api/auth/session/route.ts` — 用户 Session（Passkey 签名换取 Cookie）。
- `packages/app/src/app/api/orders/route.ts` — 订单推送企业微信。
- `packages/app/src/app/api/pay/route.ts` — Stripe PaymentIntent（alipay/wechat_pay）。
- `packages/app/src/app/api/ledger/credit/route.ts` — 管理员记账上链（Sui SDK）。
- `packages/app/src/app/api/ledger/records/route.ts` — 充值明细查询。
- `packages/app/src/app/api/pay/webhook/route.ts` — Stripe 回调接收。
- `packages/app/src/app/api/vip/*` — 会员等级/状态/申请。
- `packages/app/src/app/api/mantou/*` — 馒头余额/提现/明细。
- `packages/app/src/app/api/admin/*` — 运营后台 API。

### Shared components
- `packages/app/src/app/components/passkey-wallet.tsx` — Passkey 创建/登录/找回（Sui Passkey）。
- `packages/app/src/app/components/passkey-login-button.tsx` — 登录页一键 Passkey。
- `packages/app/src/app/components/passkey-gate.tsx` — 站内 Passkey 访问控制。
- `packages/app/src/app/components/order-store.ts` — localStorage 订单读写 + 事件广播。
- `packages/app/src/app/components/order-button.tsx` — 首页下单按钮（调用 `/api/orders`）。
- `packages/app/src/app/components/pwa-update-toast.tsx` — SW 更新提示弹窗。
- `packages/app/src/app/components/install-banner.tsx` — PWA 安装提示（当前未被引用）。
- `packages/app/src/app/components/settings-panel.tsx` — “设置”独立页面 UI。
- `packages/app/src/app/components/match-list.tsx` — 组队大厅列表 UI（当前未被引用）。
- `packages/app/src/app/components/lobby-card.tsx` — 单个房间卡片 UI（未被引用）。
- `packages/app/src/app/components/hero.tsx` — 营销 Hero UI（未被引用）。
- `packages/app/src/app/components/features.tsx` — 功能亮点 UI（未被引用）。
- `packages/app/src/lib/dubhe.ts` — Dubhe SDK 客户端与记账交易构建辅助。
- `packages/app/src/lib/admin-auth.ts` — 后台鉴权与会话管理。
- `packages/app/src/lib/admin-store.ts` — 后台数据存储（Postgres via Prisma）。
- `packages/app/src/lib/admin-audit.ts` — 审计日志写入。
- `packages/app/src/lib/chain-admin.ts` — 链上对账/裁决工具。
- `packages/app/src/lib/chain-sync.ts` — 链上订单同步。
- `packages/app/src/app/components/order-service.ts` — 客户端订单服务（服务端/本地切换）。
- `packages/app/prisma/schema.prisma` — Prisma 数据模型（Postgres）。
- `packages/app/prisma/seed.mjs` — 本地种子数据。
- `packages/app/prisma/migrations/*` — Prisma 迁移文件。
- `scripts/admin-maintenance.mjs` — 审计/支付事件表裁剪。
- `scripts/init-local.mjs` — 本地 Docker + 迁移 + seed 一键初始化。
- `scripts/chain-e2e.mjs` — 链上端到端脚本。

## packages/contracts (Move + Dubhe SDK)
- `packages/contracts/package.json` — Dubhe CLI/SDK 脚本与依赖。
- `packages/contracts/dubhe.config.ts` — Dubhe 配置源（可生成 `dubhe.config.json`）。
- `packages/contracts/dubhe.config.json` — 资源表与索引配置。
- `packages/contracts/metadata.json` — Dubhe SDK 使用的 Move metadata（需通过发布生成）。
- `packages/contracts/deployment.ts` — Dubhe config-store 输出的部署常量。

### Tabs layout & pages
- `packages/app/src/app/(tabs)/layout.tsx` — Tab 导航布局 + PasskeyGate。
- `packages/app/src/app/(tabs)/home/page.tsx` — 陪玩达人列表与下单入口。
- `packages/app/src/app/(tabs)/showcase/page.tsx` — 接单大厅（server/local 订单展示）。
- `packages/app/src/app/(tabs)/schedule/page.tsx` — 服务选择 + 撮合费/打手费流程（支持链上订单）。
- `packages/app/src/app/(tabs)/news/page.tsx` — 资讯列表（静态）。
- `packages/app/src/app/(tabs)/me/page.tsx` — 个人中心 + 进入设置/钱包。
- `packages/app/src/app/(tabs)/me/mantou/page.tsx` — 馒头余额与提现申请。
- `packages/app/src/app/(tabs)/wallet/page.tsx` — 钻石充值（Stripe 支付）。
- `packages/app/src/app/(tabs)/wallet/records/page.tsx` — 充值明细。
- `packages/app/src/app/(tabs)/vip/page.tsx` — VIP 等级展示。
- `packages/app/src/app/admin/(panel)/*` — 运营后台页面（订单/打手/公告/链上/支付/审计）。

### Public assets
- `packages/app/public/manifest.json` — PWA manifest。
- `packages/app/public/robots.txt` — robots。
- `packages/app/public/sitemap.xml` — sitemap。
- `packages/app/public/icon-192.png`, `icon-512.png` — PWA icons。
- `packages/app/public/sw.js` — 构建输出 SW（Serwist 产物）。
- `packages/app/public/swe-worker-*.js` — 额外 worker 资源（来源不明）。
- `packages/app/public/qr/*.svg` — 各类支付二维码。
- `packages/app/public/killer/*.jpg` — 达人头像资源。
- 其他静态图标：`file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg` 等。

---

## Notes / gotchas
- **包管理**: 根 README 建议 npm workspaces；app README 建议 pnpm。需要统一实际使用方式。
- **/api/pay 已被 `/wallet` 调用**: 需配置 Stripe 密钥；未配置会报错。
- **部分组件未引用**: `Hero`, `Features`, `MatchList`, `InstallBanner` 等目前无路由使用。
- **订单来源可切换**: `NEXT_PUBLIC_ORDER_SOURCE=server` 才走服务端订单，否则仍使用本地订单。
