# P0/P1 落地执行表

## P0 上线准备

- [ ] Vercel 构建验证
- [ ] 生产数据库迁移（`prisma migrate deploy`）
- [ ] 生产环境变量齐全（VAPID/Kook/Sentry/Stripe/Sui/Redis/Cron）
- [ ] 合约主网部署并更新 `deployment.ts/metadata.json`

## P1 稳定性联调

- [ ] Web Push 联调（VAPID）
- [ ] Kook Bot 联调
- [ ] E2E 预发布跑通
- [ ] 支付对账 cron + 告警链路验证
