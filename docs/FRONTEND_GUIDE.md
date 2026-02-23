# 前端协作指南（Web/PWA）

面向新人：知道去哪改、怎么改、改完如何自测。

## 1) 目录入口

- 页面路由：`packages/app/src/app/**/page.tsx`
- 组件：`packages/app/src/app/components/**`
- 业务逻辑（客户端）：`packages/app/src/lib/**`
- 样式：`packages/app/src/app/globals.css`
- 资源：`packages/app/public/**`

## 2) 关键页面与职责

- 登录页：`src/app/page.tsx`
- 主入口布局：`src/app/layout.tsx`
- Tab 导航：`src/app/(tabs)/layout.tsx`
- 首页：`src/app/(tabs)/home/page.tsx`
- 下单流程：`src/app/(tabs)/schedule/page.tsx`
- 接单大厅：`src/app/(tabs)/showcase/page.tsx`
- 充值：`src/app/(tabs)/wallet/page.tsx`
- 订单记录：`src/app/(tabs)/wallet/records/page.tsx`
- 个人中心：`src/app/(tabs)/me/page.tsx`
- 馒头：`src/app/(tabs)/me/mantou/page.tsx`
- VIP：`src/app/(tabs)/vip/page.tsx`

## 3) 常见改动方式

### A. 新增页面
1. 新建 `src/app/<route>/page.tsx`
2. 需要登录的话放在 `(tabs)` 下面，自动走 `PasskeyGate`
3. 需要 Tab 入口的，更新 `(tabs)/layout.tsx`

### B. 新增组件
- 纯 UI：放 `src/app/components/`
- 带业务逻辑或复用逻辑：放 `src/lib/` 并在组件里引用

### C. 修改样式
- 小范围：优先 Tailwind class
- 复用样式：写在 `globals.css`，注意命名与现有 `dl-* / lc-*` 体系一致

### D. 页面数据来源
- 通过 `fetch` 调 `/api/*`
- 需要鉴权的接口，前端会使用 Passkey 签名与 Session
- 本地订单/链上订单由 `NEXT_PUBLIC_ORDER_SOURCE` 和 `NEXT_PUBLIC_CHAIN_ORDERS` 控制

## 4) 新人排查指南

- 页面白屏：检查 `.env.local` 是否缺少关键变量
- 无法下单：看 `/api/orders` 返回
- 充值失败：核对 `STRIPE_SECRET_KEY`
- 订单看不到：确认 `NEXT_PUBLIC_ORDER_SOURCE=server`

## 5) 自测建议

- 关键路径：登录 → 下单 → 订单展示 → 充值
- 如果改了路由/布局：至少跑 `pnpm run dev` 本地人工回归
