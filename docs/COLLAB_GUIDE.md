# Qingyi 协作开发指南

本指南用于多人成员协作上手：理解代码结构、常见修改入口、以及改动流程建议。

## 1) 快速上手（新成员 30 分钟）

1. 安装依赖与运行环境
   - Node 22.x（见 `.nvmrc`）
   - 包管理：以 `pnpm` 为主（与 `packages/app/README.md` 一致）
2. 本地启动（Web/PWA）
   - `pnpm install`
   - `pnpm run dev -- --hostname 0.0.0.0 --port 3000`
3. 环境变量
   - 复制 `packages/app/.env.example` 到 `packages/app/.env.local`
   - 生产环境使用 Vercel 环境变量，不要提交 `.env.local`

## 2) 仓库结构（总览）

```
qingyi/
├── packages/app/          # Next.js 主应用 (PWA)
│   ├── src/app/           # 页面与 API 路由
│   ├── src/lib/           # 业务与基础库
│   ├── src/i18n/           # 中英翻译
│   ├── prisma/            # Prisma schema + migrations
│   ├── public/            # 静态资源 + PWA
│   └── scripts/           # 运维脚本
├── packages/contracts/    # Sui Move 合约与 Dubhe 配置
├── packages/mp/           # Taro 小程序
├── tests/                 # Playwright E2E
└── docs/                  # 文档
```

## 3) 主要模块：做什么、去哪改

### 3.1 页面 (App Router)
- 入口布局：`packages/app/src/app/layout.tsx`
- 登录页：`packages/app/src/app/page.tsx`
- Tab 页面：`packages/app/src/app/(tabs)/**/page.tsx`
- 管理后台：`packages/app/src/app/admin/(panel)/**`

**改页面怎么做**
- 新增页面：在 `src/app/` 创建路由目录 + `page.tsx`
- 复用组件：放到 `src/app/components/` 或 `src/lib/`（业务逻辑）
- 样式：优先用 Tailwind；全局/自定义类在 `src/app/globals.css`

### 3.2 API 路由
- 用户端：`packages/app/src/app/api/**/route.ts`
- 管理端：`packages/app/src/app/api/admin/**/route.ts`
- 定时任务：`packages/app/src/app/api/cron/**/route.ts`

**改 API 怎么做**
- 新增 API：在 `src/app/api/<route>/route.ts`
- 统一校验：使用 `parseBody`/`parseBodyRaw` + zod
- 统一鉴权：用户端 `requireUserAuth`，管理端 `requireAdmin`
- 统一响应：`NextResponse.json` + 错误码

### 3.3 业务逻辑与服务层
- 管理端数据：`packages/app/src/lib/admin/*`
- 订单/通知/增长：`packages/app/src/lib/services/*`
- Auth 与会话：`packages/app/src/lib/auth/*`
- 链上相关：`packages/app/src/lib/chain/*`
- 通用工具：`packages/app/src/lib/shared/*`

**改业务怎么做**
- 写服务函数到 `src/lib/services/`
- API 只负责鉴权 + 参数解析 + 调服务
- Prisma 查询集中在 `src/lib/admin/*` 或 `src/lib/services/*`

### 3.4 数据库与 Prisma
- 模型：`packages/app/prisma/schema.prisma`
- 迁移：`packages/app/prisma/migrations/*`
- 本地初始化：`pnpm run db:deploy` + `pnpm run db:seed`

**改数据怎么做**
- 修改 `schema.prisma`
- 生成迁移：`pnpm prisma migrate dev --schema packages/app/prisma/schema.prisma`
- 提交迁移文件

### 3.5 区块链与合约
- 合约源码：`packages/contracts/src/**`
- 部署配置：`packages/contracts/deployment.ts`
- SDK 依赖：`packages/app/src/lib/chain/*`

**改链上怎么做**
- 合约改动后需重新发布，并更新 `deployment.ts`
- 前端/后端使用 `qy-chain-lite.ts` 优先

### 3.6 小程序
- 入口：`packages/mp/src/app.ts`
- 页面：`packages/mp/src/pages/**`
- 请求封装：`packages/mp/src/utils/request.ts`

## 4) 常见改动场景

### A. 新增一个用户端页面
1. `packages/app/src/app/<route>/page.tsx`
2. 如需导航：更新相关 Tab 或入口页面
3. 需要数据时建 API（下一条）

### B. 新增一个 API 接口
1. `packages/app/src/app/api/<route>/route.ts`
2. 校验：zod + `parseBody`
3. 权限：`requireUserAuth` 或 `requireAdmin`
4. 业务逻辑放 `src/lib/services/`

### C. 修改订单流程或状态
1. 业务逻辑：`src/lib/services/order-service.ts` / `src/lib/admin/order-store.ts`
2. API：`src/app/api/orders/*`
3. 前端展示：`src/app/(tabs)/schedule`, `showcase`, `me/orders`

### D. 新增后台统计
1. API：`src/app/api/admin/*`
2. 尽量用聚合/分页，避免全量 `findMany`
3. 前端页面：`src/app/admin/(panel)/*`

## 5) 协作约定（推荐）

- 分支：`feature/*`, `fix/*`, `chore/*`
- PR 最小可合入：有描述、说明影响面、附截图或说明
- 环境变量：不要提交 `.env.local`
- 改动数据库：必须带 migration
- 重要逻辑改动：补充对应测试（unit/integration 或 Playwright）

## 6) 测试与质量

- 单测：`pnpm --filter app test`
- E2E：`pnpm exec playwright test`
- 流程检查：`npm run test:flow`（根目录）

## 7) 新人常见坑（避坑清单）

- 包管理：根 README 提到 npm，但实际使用 `pnpm` 为主
- 订单来源：`NEXT_PUBLIC_ORDER_SOURCE=server` 才走服务端订单
- Stripe/链上相关：无密钥会直接报错
- `.env` 与 `.env.local` 分工：`.env` 放非敏感默认值，敏感放 `.env.local`

## 8) 需求到实现的推荐路径

1. 明确需求入口（页面/API/后台/合约/小程序）
2. 找到对应目录
3. 从 API 入口读 → 追到 `src/lib` 逻辑
4. 改动点收敛到单一服务层
5. 补测试或写回归步骤

---

如需更细粒度的模块说明，可继续追加到 `docs/` 下分主题文档。