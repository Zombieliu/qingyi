# 项目状态（情谊电竞）

生成时间：2026-01-29

## 1) 当前仓库结构
- `packages/app`：Next.js 16 PWA 前端（Passkey 登录、订单 UI、充值 UI）
- `packages/contracts`：Dubhe + qy Move 合约（链上记账 + 仲裁流程）

## 2) 近期主要变更
- 新增 qy Move 合约包：`packages/contracts/src/qy`
  - 资源表：ruleset / ledger_balance / order
  - 系统模块：ruleset_system / ledger_system / order_system / genesis / events
  - 中文 + 英文 README
- 复制 Dubhe Move 包到：`packages/contracts/src/dubhe`（用于本地构建）
- 新增链上记账 API：`packages/app/src/app/api/ledger/credit/route.ts`
- 新增 `vercel.json`（根目录）用于强制安装 optional 依赖，避免 lightningcss 报错
- 新增 `.npmrc` 以确保 optional 依赖安装
- `.gitignore` 新增忽略 Move/Dubhe 构建产物（build, Move.lock, *.mv, *.mvd）
- `packages/app/tsconfig.json` 加入 `@serwist/next/typings`

## 3) 合约状态
- 合约包路径：`packages/contracts/src/qy`
- 说明文档：
  - 中文：`packages/contracts/src/qy/README.md`
  - English：`packages/contracts/src/qy/README.en.md`
- 状态机（链上记账）：
  - Created -> Paid -> Deposited -> Completed -> (Disputed) -> Resolved
  - Cancelled 仅允许 Created / Paid
- 备注：当前为“记账型”设计，不收币，仅维护余额数字

## 4) 前端/后端接口
- 订单推送：`POST /api/orders`（企业微信机器人）
- 记账写链：`POST /api/ledger/credit`（管理员鉴权 + Sui SDK 写链）
- 充值 QR：前端仍为双二维码手动勾选

## 5) Vercel 构建状态
- 失败错误：`Cannot find module '../lightningcss.linux-x64-gnu.node'`
- 已加入解决方案：
  - `.npmrc`：`include=optional`
  - `vercel.json`：`installCommand: npm install --include=optional`
- 待验证：重新部署确认错误消失

## 6) 环境变量清单
- 已有：`WECHAT_WEBHOOK_URL`
- 新增（链上记账）：
  - `SUI_RPC_URL`
  - `SUI_ADMIN_PRIVATE_KEY`
  - `SUI_PACKAGE_ID`
  - `SUI_DAPP_HUB_ID`
  - `SUI_DAPP_HUB_INITIAL_SHARED_VERSION`
  - `LEDGER_ADMIN_TOKEN`

## 7) 待处理事项
- 重新触发 Vercel 部署，验证 lightningcss 问题是否解决
- 部署 Dubhe + qy 合约，获取 package id 与 DappHub shared 版本号
- 视需要把前端订单流程从 localStorage 改为链上
