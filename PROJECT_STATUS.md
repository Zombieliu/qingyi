# 项目状态（情谊电竞）

生成时间：2026-02-01

## 1) 当前仓库结构
- `packages/app`：Next.js 16 PWA 前端 + 轻量运营后台（订单/打手/公告/链上/支付/审计）
- `packages/contracts`：Dubhe + qy Move 合约（链上记账 + 仲裁流程）
- `scripts/flow-test.mjs`：本地流程冒烟测试脚本（API/后台/链上可选）

## 2) 近期主要变更
- 完整上线轻量运营后台（登录/会话/RBAC/审计/支付回调）
- 后台 API：订单/打手/公告增删改查、订单导出、链上对账/争议裁决、支付事件、审计日志
- 新增后台数据存储（Postgres）、会话存储与审计记录
- 前台订单从 localStorage 迁移到服务端订单（可配置 NEXT_PUBLIC_ORDER_SOURCE）
- 新增链上订单同步与定时维护接口（/api/cron/*）
- 新增支付回调 `/api/pay/webhook`（支持 Ping++ 签名或自定义 token）
- 新增流程冒烟测试脚本 `npm run test:flow`

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
- 订单推送：`POST /api/orders`（企业微信机器人）
- 记账写链：`POST /api/ledger/credit`（管理员鉴权 + Dubhe SDK 写链）
  - 参数：`receiptId`（支付订单号/交易号，用于幂等）
- 后台接口：`/api/admin/*`（订单/打手/公告/审计/支付事件/链上对账/争议裁决）
- 支付回调：`POST /api/pay/webhook`
- 订单读写：`/api/orders`（GET/POST + PATCH）
- 定时维护与链上同步：`/api/cron/maintenance` / `api/cron/chain-sync`
- 充值 QR：前端仍为双二维码手动勾选

## 5) 构建状态
- 本地 `next build` 已通过
- Vercel 仍需确认构建命令与 workspace/lockfile 选择（若提示 workspace 或多 lockfile 警告，可在 `next.config.ts` 设定 `outputFileTracingRoot` 或清理多余 lockfile）

## 6) 环境变量清单
- 已有：`WECHAT_WEBHOOK_URL`
- 支付：`PINGPP_API_KEY`, `PINGPP_APP_ID`
- 链上记账：
  - `SUI_RPC_URL`
  - `SUI_NETWORK`（可选）
  - `SUI_ADMIN_PRIVATE_KEY`
  - `SUI_PACKAGE_ID`
  - `SUI_DAPP_HUB_ID`
  - `SUI_DAPP_HUB_INITIAL_SHARED_VERSION`
  - `LEDGER_ADMIN_TOKEN`
- 后台鉴权：
  - `ADMIN_DASH_TOKEN`
  - `ADMIN_TOKENS`, `ADMIN_TOKENS_JSON`
  - `ADMIN_SESSION_TTL_HOURS`, `ADMIN_RATE_LIMIT_MAX`, `ADMIN_LOGIN_RATE_LIMIT_MAX`
  - `ADMIN_AUDIT_LOG_LIMIT`, `ADMIN_PAYMENT_EVENT_LIMIT`, `ADMIN_CHAIN_EVENT_LIMIT`
  - `CRON_SECRET`
- 支付回调校验：
  - `PINGPP_WEBHOOK_PUBLIC_KEY`, `PINGPP_WEBHOOK_SECRET`, `PINGPP_WEBHOOK_TOKEN`

## 7) 待处理事项
- 重新触发 Vercel 部署，验证 workspace/lockfile 选择与构建告警
- 部署 Dubhe + qy 合约，获取 package id 与 DappHub shared 版本号
- 已切换到 Postgres（本地可用 Docker，提供 init 脚本、迁移与 seed）
- 链上端到端脚本：`scripts/chain-e2e.mjs`
- 视需要把前端订单流程从 localStorage 改为后端/链上
