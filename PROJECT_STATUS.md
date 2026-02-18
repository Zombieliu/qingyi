# 情谊电竞 (Qingyi Esports) — 项目状态总览

> 生成时间: 2026-02-19
> 项目: 三角洲行动 电竞陪玩平台
> 技术栈: Next.js 16 + React 19 + Sui 区块链 + Stripe 支付 + PostgreSQL

---

## 一、项目架构

```
qingyi/
├── packages/app/          # Next.js 主应用 (PWA)
│   ├── src/app/           # 页面、API 路由、组件
│   ├── src/lib/           # 核心业务逻辑 (已重构为子目录)
│   ├── src/i18n/          # 国际化翻译文件 (zh/en)
│   ├── prisma/            # 数据库 Schema (25 个模型, 12 次迁移)
│   └── public/            # 静态资源
├── packages/contracts/    # Sui Move 智能合约 (Dubhe/Obelisk 框架)
├── tests/                 # Playwright E2E + 视觉回归测试
├── scripts/               # 运维脚本
└── .github/workflows/     # CI/CD (视觉回归 + PWA SW 构建)
```

**核心技术:**
- 前端: Next.js 16 App Router, React 19, Tailwind v4, Framer Motion
- 认证: WebAuthn Passkey (无助记词钱包)
- 区块链: Sui (@mysten/sui + @0xobelisk/sui-client)
- 支付: Stripe (支付宝/微信支付)
- 数据库: PostgreSQL (Supabase) + Prisma ORM
- 缓存: Upstash Redis
- 监控: Sentry
- 部署: Vercel
- PWA: Serwist (离线支持)

---

## 二、已完成功能 ✅

### 用户端

| 模块 | 状态 | 说明 |
|------|------|------|
| Passkey 登录 | ✅ | WebAuthn 创建/登录/恢复钱包，无需助记词 |
| 首页 | ✅ | 服务套餐展示、陪玩列表、搜索、快捷操作 |
| 下单流程 | ✅ | 服务选择 → 钻石托管 → 陪玩接单 → 确认完成 → 结算 |
| 钻石充值 | ✅ | Stripe 集成，支持支付宝/微信支付，自定义金额 |
| 钱包记录 | ✅ | 钻石交易历史查询 |
| 馒头系统 | ✅ | 陪玩收益余额、提现申请、交易记录 |
| VIP 会员 | ✅ | 等级展示、申请入会、积分体系、专属权益 |
| 个人中心 | ✅ | 游戏信息设置、余额展示、快捷入口 |
| 客服工单 | ✅ | 提交支持工单 |
| 优惠券 | ✅ | 优惠券列表查看 |
| 发票申请 | ✅ | 提交开票请求 |
| 守护者申请 | ✅ | 陪玩入驻申请 |
| 公告/动态 | ✅ | 新闻列表、详情页 |
| 国际化 | ✅ | 中文(默认)/英文双语 |
| PWA 离线 | ✅ | Service Worker, 离线缓存策略 |
| 无障碍模式 | ✅ | 长辈模式 (大字体) |
| 数据分析 | ✅ | 客户端埋点、UTM 归因、会话追踪 |

### 区块链

| 模块 | 状态 | 说明 |
|------|------|------|
| Move 合约 | ✅ | 订单状态机、账本系统、争议解决、规则集 |
| 链上订单 | ✅ | Created → Paid → Deposited → Completed → (Disputed) → Resolved |
| Gas 代付 | ✅ | 赞助模式 (auto/strict/off) |
| 事件同步 | ✅ | 增量游标同步链上事件到数据库 |
| 订单缓存 | ✅ | 30s TTL 缓存层优化性能 |
| 幂等记账 | ✅ | `credit_balance_with_receipt` 带回执幂等记账 |

### 管理后台

| 模块 | 状态 | 说明 |
|------|------|------|
| 登录认证 | ✅ | Token + Session, 角色权限 (admin/ops/finance/viewer) |
| IP 白名单 | ✅ | CIDR 匹配, 可配置 |
| 审计日志 | ✅ | 全操作审计追踪 |
| 仪表盘 | ✅ | 订单统计、活跃陪玩、快捷操作 |
| 订单管理 | ✅ | CRUD、批量删除、导出、链上同步 |
| 陪玩管理 | ✅ | 档案管理、信用体系 |
| 公告管理 | ✅ | 草稿/发布/归档 |
| 优惠券管理 | ✅ | 创建/编辑/停用 |
| 收益统计 | ✅ | 营收追踪 |
| 守护者审核 | ✅ | 入驻申请审批 |
| 发票处理 | ✅ | 开票请求管理 |
| 馒头提现 | ✅ | 提现审批 (finance 角色) |
| 客服工单 | ✅ | 工单处理 |
| Token 管理 | ✅ | API 密钥管理 (admin 角色), 已迁移至数据库存储 |
| VIP 管理 | ✅ | 等级配置、会员管理、申请审批 |
| 链上对账 | ✅ | 区块链订单对账工具 (finance 角色) |
| 支付事件 | ✅ | Stripe Webhook 事件日志 |
| 数据分析 | ✅ | 增长数据 (admin 角色) |

### 支付 & 对账

| 模块 | 状态 | 说明 |
|------|------|------|
| Stripe 集成 | ✅ | PaymentIntent 创建 + Webhook 处理 |
| 支付宝/微信 | ✅ | 通过 Stripe 渠道 |
| 自动对账 | ✅ | Cron 定时对账 + 异常告警 |
| 企业微信通知 | ✅ | 订单 Webhook 推送 |

### 运维 & 自动化

| 模块 | 状态 | 说明 |
|------|------|------|
| 自动取消 | ✅ | Cron 自动取消过期未支付订单 |
| 自动结算 | ✅ | Cron 自动结算超过争议期订单 |
| 缺失清理 | ✅ | Cron 清理链上缺失订单 |
| 分布式锁 | ✅ | Redis Cron 锁防重复执行 |
| 限流 | ✅ | Redis/内存双模式限流 |
| HTTP 缓存 | ✅ | ETag + 短 TTL 缓存策略 |

### 测试 & CI/CD

| 模块 | 状态 | 说明 |
|------|------|------|
| 视觉回归 | ✅ | Playwright, 14 个断点, 266 个快照 |
| 链上 E2E | ✅ | Passkey 钱包创建 → 完整订单流程 |
| 管理后台 E2E | ✅ | 全页面功能测试 |
| CI 流水线 | ✅ | GitHub Actions (视觉回归 + PWA 构建) |
| 单元测试 | ✅ | IP 工具、链上工具函数 |

---

## 三、进行中 / 待完成 ⏳

### 3.1 lib 目录重构 (当前进行中)

已将 `src/lib/` 下 25 个文件重组为 5 个子目录:

```
lib/
├── admin/    ← admin-auth, admin-store, admin-audit, admin-types, admin-ip-utils
├── auth/     ← user-auth, user-session-store, auth-message
├── chain/    ← qy-chain, chain-sync, chain-admin, chain-sponsor, dubhe 等 13 个文件
├── i18n/     ← i18n, i18n-client, i18n-shared
└── shared/   ← cookie-utils
```

**待修复问题:**

| 问题 | 优先级 | 说明 |
|------|--------|------|
| 相对导入未更新 | 🔴 高 | `analytics-store.ts` 和 `order-guard.ts` 仍引用 `./admin-types`，需改为 `./admin/admin-types` |
| CSS 语法错误 | 🟡 中 | `globals.css:2681` 多余的 `}` 字符 |
| 临时文件清理 | 🟢 低 | `fix-imports.mjs`, `home_styles_temp.css` 需清理 |
| 提交变更 | 🟡 中 | ~110 个修改文件待 git commit |

### 3.2 部署 & 上线

| 任务 | 优先级 | 说明 |
|------|--------|------|
| Vercel 部署验证 | 🔴 高 | 重构后需验证构建通过 |
| 合约主网部署 | 🔴 高 | Move 合约目前在测试网 |
| 生产数据库迁移 | 🔴 高 | 12 次迁移待执行 (`npm run db:deploy`) |
| 性能索引迁移 | 🟡 中 | `20260216_01_perf_indexes` 待执行 |
| Token 迁移 | 🟡 中 | `20260216_00_admin_access_tokens` 待执行 (需可用 DB) |
| 管理后台 E2E | 🟡 中 | `npm run test:admin:e2e` 权限矩阵校验待跑 |

### 3.3 配置项确认

| 配置 | 说明 |
|------|------|
| Stripe | 配置 `STRIPE_SECRET_KEY` + webhook secret |
| Cron | 配置 `CRON_SECRET`，计划触发 `/api/cron/chain/*` |
| 订单模式 | 确认 `NEXT_PUBLIC_ORDER_SOURCE=server` 并配置用户 Session |

---

## 四、未来可添加功能 🚀

### 短期 (建议优先)

| 功能 | 说明 |
|------|------|
| 实时消息/聊天 | 用户与陪玩之间的即时通讯 (WebSocket/SSE) |
| 推送通知 | PWA Push Notification，订单状态变更提醒 |
| 评价系统 | 订单完成后的评分和评价，影响陪玩排名 |
| 搜索优化 | 陪玩搜索支持筛选 (段位、价格、好评率) |
| 订单详情页 | 用户端订单详情和状态追踪页面 |

### 中期

| 功能 | 说明 |
|------|------|
| 陪玩端 App | 独立的陪玩接单界面，推送接单通知 |
| 自动匹配 | 基于段位、时间、偏好的智能匹配算法 |
| 优惠券自动发放 | 基于用户行为的自动营销 (首单、回流、生日) |
| 数据看板增强 | 更丰富的运营数据可视化 (转化漏斗、留存分析) |
| 多游戏支持 | 扩展到其他游戏 (架构已支持，需增加配置) |
| 邀请返利 | 用户邀请机制，分享返钻石/馒头 |
| 排行榜 | 陪玩排行、消费排行、活跃排行 |

### 长期

| 功能 | 说明 |
|------|------|
| 原生 App | React Native / Expo 封装，提升体验 |
| 链上声誉系统 | 基于 Sui 的不可篡改评价和信用记录 |
| NFT 徽章 | VIP 等级、成就徽章 NFT |
| DAO 治理 | 社区投票决定平台规则和费率 |
| 跨链支持 | 支持更多区块链网络 |
| AI 客服 | 智能客服机器人处理常见问题 |
| 直播集成 | 陪玩直播展示，边看边下单 |

---

## 五、数据库模型 (25 个)

```
AdminOrder              # 订单
AdminPlayer             # 陪玩档案
AdminAnnouncement       # 公告
AdminSession            # 管理员会话
AdminAccessToken        # API 密钥
AdminAuditLog           # 审计日志
AdminPaymentEvent       # 支付事件
AdminSupportTicket      # 客服工单
AdminCoupon             # 优惠券
AdminInvoiceRequest     # 发票请求
AdminGuardianApplication # 守护者申请
AdminMembershipTier     # VIP 等级
AdminMember             # VIP 会员
AdminMembershipRequest  # 入会申请
LedgerRecord            # 钻石账本
GrowthEvent             # 增长事件
MantouWallet            # 馒头钱包
MantouTransaction       # 馒头交易
MantouWithdrawRequest   # 提现请求
ChainEventCursor        # 链上事件游标
UserSession             # 用户会话
```

---

## 六、API 路由总览

```
用户端:
  /api/auth/session              # 用户会话
  /api/orders/                   # 订单 CRUD + 链上同步
  /api/pay/                      # Stripe 支付 + Webhook
  /api/ledger/                   # 钻石账本 (充值/记录)
  /api/mantou/                   # 馒头 (余额/提现/交易/充值/种子)
  /api/vip/                      # VIP (等级/状态/申请)
  /api/players/                  # 陪玩列表/状态
  /api/guardians/                # 守护者申请/状态
  /api/support/                  # 客服工单
  /api/coupons/                  # 优惠券
  /api/invoices/                 # 发票
  /api/chain/sponsor             # Gas 代付

定时任务:
  /api/cron/chain-sync           # 链上事件同步
  /api/cron/chain/auto-cancel    # 自动取消过期订单
  /api/cron/chain/auto-finalize  # 自动结算完成订单
  /api/cron/chain/cleanup-missing # 清理缺失订单
  /api/cron/pay/reconcile        # 支付对账

管理后台 (23 个子路由):
  /api/admin/login|logout|refresh|me
  /api/admin/orders|players|announcements|coupons
  /api/admin/earnings|guardians|invoices|support
  /api/admin/tokens|stats|analytics|audit
  /api/admin/ledger/credit
  /api/admin/mantou/withdraws
  /api/admin/vip/members|requests|tiers
  /api/admin/chain/*
  /api/admin/payments
```

---

## 七、环境变量清单

完整清单见 `ENVIRONMENT_VARIABLES.md`，关键分组:

- **数据库**: `DATABASE_URL`, `DATABASE_DIRECT_URL`
- **后台鉴权**: `ADMIN_DASH_TOKEN`, `ADMIN_TOKENS_JSON`, `ADMIN_SESSION_TTL_HOURS`, `ADMIN_IP_ALLOWLIST`
- **用户鉴权**: `USER_SESSION_TTL_HOURS`, `AUTH_MAX_SKEW_MS`, `AUTH_NONCE_TTL_MS`
- **支付**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- **区块链**: `SUI_RPC_URL`, `SUI_NETWORK`, `SUI_ADMIN_PRIVATE_KEY`, `SUI_PACKAGE_ID`, `SUI_DAPP_HUB_ID`
- **Gas 代付**: `SUI_SPONSOR_PRIVATE_KEY`, `NEXT_PUBLIC_CHAIN_SPONSOR`
- **通知**: `WECHAT_WEBHOOK_URL`
- **Cron**: `CRON_SECRET`, `CRON_LOCK_TTL_MS`
- **监控**: `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`
- **客户端**: `NEXT_PUBLIC_ORDER_SOURCE`, `NEXT_PUBLIC_CHAIN_ORDERS`, `NEXT_PUBLIC_QR_*`

---

## 八、当前 Git 状态

- 分支: `main`
- 已修改文件: ~110 个 (lib 重构导致大量导入路径更新)
- 已删除文件: 25 个 (旧的 lib 平铺文件)
- 新增目录: `lib/admin/`, `lib/auth/`, `lib/chain/`, `lib/i18n/`, `lib/shared/`
- 状态: 未提交

---

*此文档基于 2026-02-19 项目扫描生成，替代旧版 2026-02-16 状态文档。*
