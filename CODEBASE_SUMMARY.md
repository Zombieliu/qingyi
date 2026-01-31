# 情谊电竞 / Delta Monorepo — Codebase Summary (generated 2026-01-29)

## 1) Quick overview
- **Repo type**: npm workspaces monorepo with a single Next.js app in `packages/app`.
- **Product**: 情谊电竞 PWA for《三角洲行动》陪玩/组队调度，含 Passkey 登录、下单/派单、充值与信息展示。
- **Runtime**: Next.js 16 App Router, React 19, TypeScript, Tailwind v4 + custom CSS classes, Serwist PWA, Lucide icons, Mysten Sui Passkey.

## 2) Key user flows (logic-level)
- **Passkey 登录/注册**: `/` 登录页（`page.tsx`）-> `PasskeyLoginButton` 触发 WebAuthn/Sui Passkey 创建或登录 -> 本地存储 `qy_passkey_wallet_v3` -> 跳转 `/home`。
- **Passkey Gate**: `(tabs)/layout.tsx` 使用 `PasskeyGate` 检查 `qy_passkey_wallet_v3`，未登录则展示 `PasskeyWallet` 注册/找回页面。
- **下单 & 推送**: `OrderButton` POST `/api/orders` -> 企业微信机器人（`WECHAT_WEBHOOK_URL`）发 Markdown 消息 -> 写入本地订单 `dl_orders`。
- **派单/支付流程**: `/schedule` 选择服务并支付撮合费（二维码）-> 写订单到本地（含撮合费/打手费字段）-> 订单状态驱动 UI 三段式流程。
- **订单展示**: `/showcase` 读取 `dl_orders` 展示接单大厅状态、司机信息、取消/完成。
- **充值**: `/wallet` 双二维码分账手工支付 + 勾选确认（无后端校验）。
- **PWA**: Serwist service worker + `PwaUpdateToast` 提示更新，支持离线缓存与安装提示（`InstallBanner` 目前未使用）。

## 3) Storage & events
- **localStorage keys**:
  - `qy_passkey_wallet_v3`: Passkey 钱包（Sui 地址 + base64 公钥）。
  - `dl_orders`: 本地订单列表（最多 20 条）。
- **custom events**:
  - `passkey-updated`: Passkey 状态更新时广播。
  - `orders-updated`: 订单变更时广播。

## 4) Backend/API (Next.js route handlers)
- `POST /api/orders` → 企业微信机器人 Markdown 推送。需要 `WECHAT_WEBHOOK_URL`。
- `POST /api/pay` → Ping++ 预生成支付 charge。需要 `PINGPP_API_KEY` 与 `PINGPP_APP_ID`。
  - 注意：当前前端未调用 `/api/pay`。
- `POST /api/ledger/credit` → 管理员记账上链（Dubhe SDK）。需要链上相关环境变量。

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
  - `PINGPP_API_KEY`, `PINGPP_APP_ID`: Ping++ 支付
  - `SUI_RPC_URL`: Sui RPC
  - `SUI_NETWORK`: 网络标识（testnet/mainnet/devnet/localnet，可选）
  - `SUI_ADMIN_PRIVATE_KEY`: 管理员私钥
  - `SUI_PACKAGE_ID`: qy 合约 package id
  - `SUI_DAPP_HUB_ID`: DappHub shared object id
  - `SUI_DAPP_HUB_INITIAL_SHARED_VERSION`: DappHub shared version
  - `LEDGER_ADMIN_TOKEN`: 记账接口管理员 token
- **Client-side (NEXT_PUBLIC_*)**
  - `NEXT_PUBLIC_QR_PLATFORM_FEE`: 平台撮合费二维码
  - `NEXT_PUBLIC_QR_PLAYER_FEE`: 打手费用二维码
  - `NEXT_PUBLIC_QR_COMPANION`: 陪玩收款码
  - `NEXT_PUBLIC_QR_ESPORTS`: 赛事/平台收款码

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
- `packages/app/src/app/api/orders/route.ts` — 订单推送企业微信。
- `packages/app/src/app/api/pay/route.ts` — Ping++ charge 生成。
- `packages/app/src/app/api/ledger/credit/route.ts` — 管理员记账上链（Sui SDK）。

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

## packages/contracts (Move + Dubhe SDK)
- `packages/contracts/package.json` — Dubhe CLI/SDK 脚本与依赖。
- `packages/contracts/dubhe.config.ts` — Dubhe 配置源（可生成 `dubhe.config.json`）。
- `packages/contracts/dubhe.config.json` — 资源表与索引配置。
- `packages/contracts/metadata.json` — Dubhe SDK 使用的 Move metadata（需通过发布生成）。
- `packages/contracts/deployment.ts` — Dubhe config-store 输出的部署常量。

### Tabs layout & pages
- `packages/app/src/app/(tabs)/layout.tsx` — Tab 导航布局 + PasskeyGate。
- `packages/app/src/app/(tabs)/home/page.tsx` — 陪玩达人列表与下单入口。
- `packages/app/src/app/(tabs)/showcase/page.tsx` — 接单大厅（本地订单演示）。
- `packages/app/src/app/(tabs)/schedule/page.tsx` — 服务选择 + 撮合费/打手费流程。
- `packages/app/src/app/(tabs)/news/page.tsx` — 资讯列表（静态）。
- `packages/app/src/app/(tabs)/me/page.tsx` — 个人中心 + 进入设置/钱包。
- `packages/app/src/app/(tabs)/wallet/page.tsx` — 钻石充值（双二维码手动支付）。
- `packages/app/src/app/(tabs)/vip/page.tsx` — VIP 等级展示。

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
- **/api/pay 未被前端调用**: 若需真实支付流程可在 `/wallet` 接入。
- **部分组件未引用**: `Hero`, `Features`, `MatchList`, `InstallBanner` 等目前无路由使用。
- **本地存储为主**: 订单与钱包均在 localStorage，暂无真实后端状态同步。
