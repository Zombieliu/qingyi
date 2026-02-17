# 项目状态（情谊电竞）

生成时间：2026-02-16

## 1) 当前仓库结构
- `packages/app`：Next.js 16 PWA 前端 + 轻量运营后台（订单/打手/公告/链上/支付/审计）
- `packages/contracts`：Dubhe + qy Move 合约（链上记账 + 仲裁流程）
- `scripts/flow-test.mjs`：本地流程冒烟测试脚本（API/后台/链上可选）

## 2) 近期主要变更
- 前端充值已接入 Stripe PaymentIntents（支付宝/微信支付），新增充值明细页 `/wallet/records`
- 用户端订单支持 server/local 切换；服务端模式使用 Passkey 签名 + Session（`/api/auth/session`）
- 新增会员中心前台 `/vip` + 后台 `/admin/vip`，我的页入口已接入
- Mantou 余额/提现前台与后台流程已接入（`/me/mantou` + `/admin/mantou`）
- 链上维护 cron 增加 auto-cancel / auto-finalize / cleanup-missing
- 轻量运营后台完善（支付事件、审计、链上对账/争议）
- 新增支付对账 cron（支持 Stripe API 补账与告警）
- 后台/公共接口增加短 TTL 缓存 + ETag，cron 增加防重入锁，API 增加 traceId

## 3) 合约状态
- 合约包路径：`packages/contracts/src/qy`
- 说明文档：
  - 中文：`packages/contracts/src/qy/README.md`
  - English：`packages/contracts/src/qy/README.en.md`
- 状态机（链上记账）：
  - Created -> Paid -> Deposited -> Completed -> (Disputed) -> Resolved
  - Cancelled 仅允许 Created / Paid
- 备注：当前为“记账型”设计，不收币，仅维护余额数字
- 新增：`credit_balance_with_receipt`（带回执幂等记账）

## 4) 前端/后端接口
- 订单：`/api/orders`（GET/POST）+ `/api/orders/[orderId]`（GET/PATCH）+ `/api/orders/[orderId]/chain-sync`
  - 服务端模式走 Passkey 签名/Session；公共池支持 cursor 分页
- 用户会话：`POST /api/auth/session` / `DELETE /api/auth/session`
- 支付：`POST /api/pay`（Stripe：alipay/wechat_pay）+ `POST /api/pay/webhook`
- 充值明细：`GET /api/ledger/records`
- 记账写链：`POST /api/ledger/credit`（管理员鉴权 + Dubhe SDK）
- 会员中心：`/vip` + `/api/vip/*`；会员后台：`/admin/vip` + `/api/admin/vip/*`
- Mantou：`/me/mantou` + `/api/mantou/*`；后台：`/admin/mantou` + `/api/admin/mantou/*`
- 后台接口：`/api/admin/*`（订单/打手/公告/支付事件/审计/链上对账/争议）
- 定时任务：`/api/cron/maintenance` / `/api/cron/chain-sync` / `/api/cron/chain/*` / `/api/cron/pay/reconcile`

## 5) 构建状态
- 本地 `next build` 已通过
- Vercel 仍需确认构建命令与 workspace/lockfile 选择（若提示 workspace 或多 lockfile 警告，可在 `next.config.ts` 设定 `outputFileTracingRoot` 或清理多余 lockfile）

## 6) 环境变量清单
- 订单推送：`WECHAT_WEBHOOK_URL`
- 支付（Stripe）：`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`（可选）
- 用户鉴权：`USER_SESSION_TTL_HOURS`, `AUTH_MAX_SKEW_MS`, `AUTH_NONCE_TTL_MS`
- 订单限流：`ORDER_RATE_LIMIT_WINDOW_MS`, `ORDER_RATE_LIMIT_MAX`, `PUBLIC_ORDER_RATE_LIMIT_MAX`
- 链上记账：
  - `SUI_RPC_URL`, `SUI_NETWORK`（可选）, `SUI_ADMIN_PRIVATE_KEY`
  - `SUI_PACKAGE_ID`, `SUI_DAPP_HUB_ID`, `SUI_DAPP_HUB_INITIAL_SHARED_VERSION`
  - `LEDGER_ADMIN_TOKEN`
- 链上维护：`CHAIN_ORDER_AUTO_CANCEL_HOURS`, `CHAIN_ORDER_AUTO_CANCEL_MAX`,
  `CHAIN_ORDER_AUTO_COMPLETE_HOURS`, `CHAIN_ORDER_AUTO_COMPLETE_MAX`, `CHAIN_ORDER_AUTO_FINALIZE_MAX`,
  `CHAIN_MISSING_CLEANUP_ENABLED`, `CHAIN_MISSING_CLEANUP_MAX_AGE_HOURS`, `CHAIN_MISSING_CLEANUP_MAX`
- 后台鉴权：
  - `ADMIN_DASH_TOKEN`
  - `ADMIN_TOKENS`, `ADMIN_TOKENS_JSON`
  - `ADMIN_SESSION_TTL_HOURS`, `ADMIN_RATE_LIMIT_MAX`, `ADMIN_LOGIN_RATE_LIMIT_MAX`
  - `ADMIN_AUDIT_LOG_LIMIT`, `ADMIN_PAYMENT_EVENT_LIMIT`, `ADMIN_CHAIN_EVENT_LIMIT`
  - `CRON_SECRET`
- 完整清单见 `ENVIRONMENT_VARIABLES.md`

## 7) 待处理事项
- 重新触发 Vercel 部署，验证 workspace/lockfile 选择与构建告警
- 部署 Dubhe + qy 合约，获取 package id 与 DappHub shared 版本号
- 生产环境执行 Prisma 迁移（`db:deploy`）并按需 seed
- 索引优化迁移 `20260216_01_perf_indexes` 待执行（需可用 DB 后再跑 `npm run db:deploy`）
- 后台“密钥管理”已改为数据库存储，迁移 `20260216_00_admin_access_tokens` 待执行（当前 `.env` 指向的 Supabase 连接不可达，需切换可用 DB 后再跑 `npm run db:deploy`）
- 后台权限矩阵自动化校验（`npm run test:admin:e2e`）待跑
- 若启用 Stripe 充值，配置 `STRIPE_SECRET_KEY` 与 webhook secret
- 若启用链上自动维护，配置 `CRON_SECRET` 并计划触发 `/api/cron/chain/*`
- 若要完全切到服务端订单，确保 `NEXT_PUBLIC_ORDER_SOURCE=server` 并配置用户 Session
