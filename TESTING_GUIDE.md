# 测试指南（全流程 + 后台）

本文覆盖：本地数据库、后台登录与功能验证、订单/支付/链上流程、冒烟测试脚本。
相关性能/稳定性优化参考：`OPTIMIZATION_TODO.md`。

## 0. 前置条件
- 已安装：Docker、Node.js 20+、npm/pnpm
- 代码已拉取且依赖已安装（`npm install` 或 `pnpm install`）

## 1. 一键初始化（推荐）
```bash
node scripts/init-local.mjs
```
该脚本会：
- 启动本地 Postgres（Docker）
- 执行迁移（db:deploy）
- 写入种子数据（db:seed）

## 2. 环境变量
在根目录 `.env.local` 中至少加入：
```
DATABASE_URL=postgresql://qingyi:qingyi@localhost:5432/qingyi?schema=public
ADMIN_DASH_TOKEN=your-admin-token
```
其他与链上相关的变量参考 `.env.example`。

> 注意：Prisma 默认读取 `packages/app/.env`，但脚本已传入 `DATABASE_URL`，不必额外创建。

## 3. 启动开发环境
```bash
npm run dev
```
访问：`http://127.0.0.1:3000`

## 4. 后台登录与功能验证
### 4.1 登录
- 入口：`/admin/login`
- 使用 `.env.local` 中的 `ADMIN_DASH_TOKEN` 登录

### 4.2 核心功能检查
按顺序执行：
1) 运营概览（/admin）
- 看仪表盘是否有统计数据

2) 订单调度（/admin/orders）
- 查看订单列表
- 修改付款状态、派单、备注、阶段是否可保存
- 点击“查看”进入订单详情页
- 点击“导出 CSV”

3) 客服工单（/admin/support）
- 查看工单列表、修改状态与备注

4) 优惠卡券（/admin/coupons）
- 新建优惠券
- 修改状态/金额/有效期

5) 打手管理（/admin/players）
- 新建打手
- 修改状态/备注
- 删除打手

6) 护航申请（/admin/guardians）
- 查看申请、修改状态与备注

7) 公告资讯（/admin/announcements）
- 新建公告
- 发布/归档/取消归档
- 删除公告

8) 发票申请（/admin/invoices）
- 查看开票申请、修改状态与备注

9) 支付事件（/admin/payments）
- 查看支付回调记录（如未触发会为空）

10) 审计日志（/admin/audit）
- 检查是否有操作记录

11) 链上对账（/admin/chain）
- 若链上环境齐备，查看对账与争议裁决

## 5. 自动化冒烟测试（推荐）
```bash
npm run test:flow
```
包含：
- API 下单（/api/orders）
- 后台登录 + 订单/公告/打手增改

可选参数：
```bash
npm run test:flow -- --chain
npm run test:flow -- --ledger
```

### 5.1 后台 UI E2E（Playwright）
```bash
npm run test:admin:e2e
```
说明：
- 需要 `.env.local` 中配置 `ADMIN_DASH_TOKEN` 或 `LEDGER_ADMIN_TOKEN`
- 会自动启动/复用本地 dev server，并在后台完成订单/公告/打手的完整操作

## 6. 链上流程（可选）
需要 `.env.local` 中配置：
```
SUI_RPC_URL=...
SUI_NETWORK=testnet
SUI_ADMIN_PRIVATE_KEY=...
SUI_PACKAGE_ID=...
SUI_DAPP_HUB_ID=...
SUI_DAPP_HUB_INITIAL_SHARED_VERSION=...
LEDGER_ADMIN_TOKEN=...
NEXT_PUBLIC_CHAIN_ORDERS=1
NEXT_PUBLIC_QY_DEFAULT_COMPANION=...
```
推荐测试路径：
1) 前台下单 -> 链上创建订单
2) 陪玩/用户推进状态
3) 后台链上对账（/admin/chain）
4) 后台争议裁决（如有争议订单）

### 6.1 脚本化链上全链路（推荐）
```bash
npm run test:chain:script
```
可选变量：
```
E2E_SUI_USER_PRIVATE_KEY=...
E2E_SUI_COMPANION_PRIVATE_KEY=...
E2E_SUI_ADMIN_PRIVATE_KEY=...
E2E_ORDER_SERVICE_FEE=1
E2E_ORDER_DEPOSIT=1
```
可选参数：
```
node scripts/chain-e2e.mjs --no-dispute
node scripts/chain-e2e.mjs --sync
node scripts/chain-e2e.mjs --init
node scripts/chain-e2e.mjs --credit
node scripts/chain-e2e.mjs --skip-sync
```

## 7. 支付回调（可选）
模拟 Stripe 回调：
- POST `/api/pay/webhook`
- 推荐配置 `STRIPE_WEBHOOK_SECRET` 进行签名校验
- 触发后可在后台“支付事件”查看记录

## 7.1 支付对账（可选）
执行对账（默认 dry-run）：
- GET `/api/cron/pay/reconcile`
- 加 `apply=1` 执行补账/修复

## 8. 常见问题
- **Prisma 找不到 DATABASE_URL**
  - 使用脚本（db:deploy / db:seed）时传入 `DATABASE_URL` 或确保 `.env.local` 设置。

- **迁移报 P3005**
  - 说明 DB 已通过 db:push 初始化，需要 baseline：
  ```bash
  npx prisma migrate resolve --schema packages/app/prisma/schema.prisma --applied 20260201_init_admin_store
  ```

- **后台无数据**
  - 执行 `npm run db:seed --workspace app`

- **定时维护/链上同步**
  - 本地可直接调用：
  ```bash
  curl \"http://127.0.0.1:3000/api/cron/maintenance\"\n  curl \"http://127.0.0.1:3000/api/cron/chain-sync\"\n  ```
  - 生产建议配置 `CRON_SECRET` 并使用 `?token=` 或 `x-cron-secret` 调用

---

如需全量回归测试：
1) `node scripts/init-local.mjs`
2) `npm run dev`
3) `npm run test:flow`
