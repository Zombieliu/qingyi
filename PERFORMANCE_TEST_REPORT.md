# Performance Test Report (Production Test Environment)

Date: 2026-02-17
Target: https://qingyi.obelisk.build
Runner: Node.js fetch (timeout 10s). Results are from the current machine/region.
Auth: Admin endpoints used `x-admin-token` from `packages/app/.env` (redacted).

## Scope
### Public read mix
- `GET /api/players`
- `GET /api/vip/tiers`
- `GET /api/coupons`

### Admin read mix
- `GET /api/admin/stats`
- `GET /api/admin/orders?page=1&pageSize=20`
- `GET /api/admin/players`
- `GET /api/admin/payments`
- `GET /api/admin/analytics?days=7`

### Not executed
- User-authenticated endpoints (require Sui signature/session cookie).
- Cron endpoints (side effects: cleanup/cancel/finalize/chain sync). See “Limitations”.

## Results (low concurrency baseline, 20s each)
Effective success rate = completed responses / (completed + errors + timeouts).

| Scenario | Concurrency | RPS | p50 ms | p95 ms | p99 ms | Avg ms | Max ms | Timeouts | Effective success |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| public-read | 1 | 0.55 | 1825 | 4173 | 4173 | 1837 | 4173 | 0 | 100% |
| public-read | 2 | 0.85 | 2788 | 3195 | 3195 | 2414 | 3195 | 0 | 100% |
| public-read | 5 | 1.55 | 3557 | 7734 | 7798 | 3698 | 7798 | 0 | 100% |
| admin-read | 1 | 0.55 | 1882 | 2168 | 2168 | 1937 | 2168 | 0 | 100% |
| admin-read | 2 | 0.55 | 3371 | 6267 | 6267 | 4039 | 6267 | 0 | 100% |
| admin-read | 5 | 0.60 | 4897 | 8483 | 8483 | 5493 | 8483 | 5 | 70.59% |

## Results (higher concurrency stress, 30s each)

| Scenario | Concurrency | RPS | p50 ms | p95 ms | p99 ms | Avg ms | Max ms | Timeouts | Effective success |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| public-read | 10 | 1.37 | 5145 | 8787 | 9345 | 5551 | 9345 | 13 | 75.93% |
| public-read | 20 | 0.53 | 2076 | 7345 | 7345 | 2887 | 7345 | 60 | 20.78% |
| public-read | 40 | 1.30 | 3531 | 8951 | 9236 | 4029 | 9236 | 117 | 24.84% |
| admin-read | 5 | 0.33 | 7000 | 9556 | 9556 | 7151 | 9556 | 10 | 50.00% |
| admin-read | 10 | 0.33 | 6067 | 8956 | 8956 | 6583 | 8956 | 27 | 25.64% |
| admin-read | 20 | 0.47 | 4935 | 9632 | 9632 | 5520 | 9632 | 58 | 19.18% |

## Observations
- Latency is high even at low concurrency (p50 ~1.8–4.9s, p95 up to ~8.5s).
- Throughput is low: public read mix peaks around ~1.5 rps; admin read mix around ~0.6 rps in baseline.
- At higher concurrency, timeouts grow quickly and effective success rate drops below 50%.

## Rough capacity estimate (based on public-read baseline ~1.5 rps)
This is a coarse estimate and only for the tested read-only mix.

| Assumed per-user request rate | Approx. active users supported |
|---:|---:|
| 0.1 rps (1 req / 10s) | ~15 |
| 0.2 rps (1 req / 5s) | ~7 |
| 0.5 rps (1 req / 2s) | ~3 |

Admin usage will reduce this further if admin dashboards are active.

## Limitations / Risks
- **User-auth flows not tested** (require Sui signature or valid session cookie). Real user traffic may be heavier/slower.
- **Cron endpoints not load-tested** because they perform destructive or state-changing operations (auto-cancel, cleanup, finalize, chain sync). If you want these tested, schedule a safe window and I’ll run them with the appropriate header/token.
- Results reflect **current network path** from this machine; latency may vary by region.
- Production test environment capacity may differ from real production sizing.

## Recommended next steps
1. Provide a test wallet private key or a valid user session cookie to exercise user-authenticated endpoints.
2. If cron tests are required, confirm which cron routes are safe to execute in this environment.
3. Apply the pending perf index migration `20260216_01_perf_indexes` (noted in `PROJECT_STATUS.md`).
4. Confirm DB pooling settings (`DATABASE_POOL_URL`, `PRISMA_CONNECTION_LIMIT`) if you expect higher concurrency.
