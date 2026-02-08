# 当前进度总结

## 已完成
- 后台 UI 结构与样式整体重构：`packages/app/src/app/admin/admin.css` 与 `packages/app/src/app/admin/(panel)/admin-shell.tsx` 及多页面布局统一。
- 后台多页面样式适配：订单/支持/护航/优惠券/公告/发票/VIP 等页面统一卡片、表格、搜索输入样式。
- 新增后台“增长数据”页面与导航入口：
  - `packages/app/src/app/admin/(panel)/analytics/page.tsx`
  - `packages/app/src/app/admin/(panel)/admin-shell.tsx`
- 自研埋点与统计：
  - 埋点接口：`packages/app/src/app/api/track/route.ts`
  - 数据汇总接口：`packages/app/src/app/api/admin/analytics/route.ts`
  - 客户端埋点：`packages/app/src/app/components/analytics.ts`
  - 路由级 page_view 触发：`packages/app/src/app/components/analytics-provider.tsx` + `packages/app/src/app/layout.tsx`
  - 存储层：`packages/app/src/lib/analytics-store.ts`
  - Prisma 模型与迁移：`packages/app/prisma/schema.prisma` + `packages/app/prisma/migrations/20260206_00_growth_event/`
- 首单满99减10落地（客户端+服务端校验）：
  - 前端逻辑与展示：`packages/app/src/app/(tabs)/schedule/page.tsx` + `packages/app/src/app/globals.css`
  - 服务端校验：`packages/app/src/app/api/orders/route.ts` + `packages/app/src/lib/admin-store.ts`
- 公共页重做（增长导向）：`/`、`/pricing`、`/faq`
  - `packages/app/src/app/page.tsx`
  - `packages/app/src/app/pricing/page.tsx`
  - `packages/app/src/app/faq/page.tsx`
- 环境变量文档补充埋点配置项：
  - `ENVIRONMENT_VARIABLES.md`

## 未完成 / 待你确认执行
- 数据库迁移未执行（需要你确认）：
  - 本地开发：`pnpm --filter app db:migrate`
  - 生产部署：`pnpm --filter app db:deploy`
- 埋点限流环境变量未配置（可选但建议）：
  - `TRACK_RATE_LIMIT_WINDOW_MS`
  - `TRACK_RATE_LIMIT_MAX`

## 可能的后续增强（未落地）
- 为更多关键行为补充埋点（如登录、支付、客服触达等）。
- 若有其它下单入口，考虑同步首单优惠的逻辑或明确只在当前入口生效。

## 未运行
- 未运行测试/构建命令。
