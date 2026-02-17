# 优化清单（建议优先级）

> 目标：减少高频请求、提升链上流程稳定性、增强可观测性。

## P0（高收益 / 低风险）
- 链上/余额请求统一节流：已完成（API 级），如需可加“白名单+强制实时”细化。
- 清理 SW/PWA 缓存：已落地（后台 SW 控制面板支持清理缓存）。
- cron 防重入锁：已落地（支持 `CRON_LOCK_TTL_MS`）。
- 链上任务避免全表扫描：已落地（链上专用查询）。
- 关键索引补齐：订单 assignedTo/companionAddress/source，护航 userAddress。
- 链上同步增量 cursor：已落地（持久化事件 cursor，增量同步）。

## P1（体验 / 稳定）
- 全局请求错误可视化：已落地（后台 API 失败 toast + traceId）。
- 链上状态轮询退避：已落地（schedule/showcase 指数退避 + 页面不可见时暂停）。
- 链上同步超时提示：已落地（同步重试次数 + 最近尝试时间）。

## P2（成本 / 性能）
- 服务端缓存细化：为 `/api/orders`（public）、`/api/players`、后台统计/分析加短 TTL + ETag（已完成）。
- 客户端缓存分层：已落地（列表显示缓存提示，后台统一 SWR 表达）。
- 后台列表游标分页：已落地（orders/support/coupons/invoices/guardians/vip/审计/支付/馒头）。
- 打手额度聚合：已落地（DB groupBy 计算在途额度）。

## P3（安全 / 运维）
- env 同步脚本：已落地（`npm run vercel:env:sync` 支持一键写入 All Environments）。
- Sentry Token 旋转：已落地（`npm run sentry:rotate` 更新 Vercel env，旧 token 需手动撤销）。
- 用户会话/护航申请限流：已落地（`AUTH_SESSION_RATE_LIMIT_*`、`GUARDIAN_RATE_LIMIT_*`）。
- API traceId：已落地（middleware 注入 `x-trace-id`）。
