# 团队协作规范

适用于多开发者并行协作，减少冲突、保证可回滚与可追溯。

## 1) 分支与命名

- 主分支：`main`
- 功能分支：`feature/<topic>`
- 修复分支：`fix/<topic>`
- 杂项分支：`chore/<topic>`

示例：
- `feature/order-flow`
- `fix/pay-webhook`
- `chore/update-docs`

## 2) 提交信息规范

格式：`<type>: <summary>`

- feat: 新功能
- fix: 修复问题
- docs: 文档
- refactor: 重构
- test: 测试
- chore: 杂项

示例：
- `feat: add referral reward UI`
- `fix: guard order list auth`
- `docs: update onboarding guide`

## 3) PR 规范

PR 描述需包含：
- 变更背景与目的
- 影响范围（页面/API/数据库/链上）
- 回归方式（本地/测试用例）
- 截图或录屏（涉及 UI）

## 4) 代码评审要点

- 是否影响订单/支付/链上核心路径
- 是否破坏权限边界
- 是否引入全量查询或 N+1
- 是否新增缺失的测试
- 是否改动环境变量或密钥

## 5) 冲突与合并策略

- 小步提交，避免超大 PR
- 同一功能只保留一个活跃分支
- 合并前同步主分支并解决冲突

## 6) 测试与回归清单

- 关键页面：登录 → 下单 → 订单 → 充值
- 后台页面：订单/统计/对账
- 如涉及链上：运行 `npm run test:chain:script`
- 如涉及 E2E：`pnpm exec playwright test`

## 7) 环境变量与密钥

- `.env.local` 不提交
- `.env` 仅放非敏感默认值
- 生产变量统一放 Vercel

## 8) 文档与更新

- 重要变更必须更新对应 docs
- 新增模块需更新 `docs/COLLAB_GUIDE.md`

## 9) 生产相关变更

- DB 迁移需要明确步骤与回滚方案
- 依赖升级需注明影响面
