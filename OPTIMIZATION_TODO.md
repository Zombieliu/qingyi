# 优化清单（建议优先级）

> 目标：减少高频请求、提升链上流程稳定性、增强可观测性。

## P0（高收益 / 低风险）
- 链上/余额请求统一节流：已完成（API 级），如需可加“白名单+强制实时”细化。
- 清理 SW/PWA 缓存：避免前端继续使用旧代码/旧环境变量。

## P1（体验 / 稳定）
- 全局请求错误可视化：API 错误统一 toast + traceId，排查更快。
- 链上状态轮询退避：schedule/showcase 轮询改为指数退避 + 页面不可见时暂停。
- 链上同步超时提示：UI 显示剩余重试次数/最后同步时间。

## P2（成本 / 性能）
- 服务端缓存细化：为 `/api/orders`、`/api/players` 等读多接口加短 TTL + ETag。
- 客户端缓存分层：readCache 加 `stale-while-revalidate` UI 表达策略。

## P3（安全 / 运维）
- env 同步脚本：从 `.env` 一键写入 All Environments。
- Sentry Token 旋转：历史泄漏已发生，建议更换并废弃旧 token。
