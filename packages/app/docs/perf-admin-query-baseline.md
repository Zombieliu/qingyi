# Admin Query Performance Baseline

用于上线前对关键后台查询做固定样本压测，并输出 `P95/P99` 与索引命中信号。

## 运行

```bash
pnpm --dir packages/app perf:admin-baseline
```

可选参数：

```bash
pnpm --dir packages/app perf:admin-baseline --iterations 80 --warmup 10
pnpm --dir packages/app perf:admin-baseline --output docs/perf-admin-query-baseline.latest.json
pnpm --dir packages/app perf:admin-baseline --json
```

## 输出说明

- `p50 / p95 / p99 / avg`：每条查询的延迟分位，单位毫秒。
- `index_hit`：计划中是否命中期望索引（基于 `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` 解析）。
- 脚本覆盖查询：
  - `orders_cursor`
  - `orders_public_cursor`
  - `support_cursor`
  - `referral_list`
  - `members_cursor`
  - `payment_events_cursor`

## 上线建议

- 发布前至少跑一轮，保留 JSON 报告。
- 若 `index_hit = no`，优先检查：
  - 统计信息是否过期（`ANALYZE`）
  - 查询条件是否偏离索引前缀
  - 新增筛选是否需要补复合索引
- 若 `p95/p99` 明显抬升，先比对最近迁移和查询条件变更，再决定是否加索引或调整筛选逻辑。
