# 后端协作指南（API/服务层）

面向新人：知道 API、服务层、数据访问怎么放置与修改。

## 1) 目录入口

- API 路由：`packages/app/src/app/api/**/route.ts`
- 管理 API：`packages/app/src/app/api/admin/**/route.ts`
- 定时任务：`packages/app/src/app/api/cron/**/route.ts`
- 服务层：`packages/app/src/lib/services/**`
- 管理端数据层：`packages/app/src/lib/admin/**`
- 认证与权限：`packages/app/src/lib/auth/**`、`packages/app/src/lib/admin/admin-auth.ts`
- 通用工具：`packages/app/src/lib/shared/**`

## 2) 新增 API 的推荐结构

1. 解析与校验：zod + `parseBody` / `parseBodyRaw`
2. 鉴权：
   - 用户端：`requireUserAuth`
   - 管理端：`requireAdmin`
   - cron：`isAuthorizedCron`
3. 业务逻辑：放到 `src/lib/services/*` 或 `src/lib/admin/*`
4. 返回：`NextResponse.json`

## 3) 数据访问与 Prisma

- 普通业务查询：`src/lib/services/*`
- 管理后台查询：`src/lib/admin/*`
- 迁移变更：`packages/app/prisma/migrations/*`

## 4) 权限与安全要点

- 管理端接口必须走 `requireAdmin`
- 用户端必须校验 `requireUserAuth` 且 intent 明确
- 速率限制：`rate-limit.ts`
- Cron 任务需 `CRON_SECRET`

## 5) 常见改动场景

### A. 新增后台列表
1. 管理 API：`/api/admin/...`
2. 数据读取：`src/lib/admin/*-store.ts`
3. 统一分页/游标逻辑（避免全量）

### B. 新增业务服务
1. 服务逻辑：`src/lib/services/<domain>-service.ts`
2. API 调服务

### C. 新增通知/事件
1. 站内通知：`src/lib/services/notification-service.ts`
2. SSE 推送：`src/lib/realtime.ts`
3. Web Push：`src/lib/services/push-service.ts`

## 6) 自测建议

- API 单测：`pnpm --filter app test`
- E2E（如涉及流程）：`pnpm exec playwright test`
- 运行时回归：调用对应 API 校验
