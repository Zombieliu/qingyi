# Performance Status (from repo + .env)

Date: 2026-02-17
Sources: `packages/app/.env` (sanitized), `packages/app/docs/CHAIN_ORDER_OPTIMIZATION.md`,
`packages/app/docs/CHAIN_ORDER_OPTIMIZATION_SUMMARY.md`.

## Overall conclusion
- No end-to-end/system-wide load or stress test artifacts were found in the repo (e.g. k6/locust/jmeter/gatling/artillery/wrk scripts or reports).
- Existing performance data is scoped to the chain-order cache/query path, not whole-app capacity.
- Therefore, current user capacity cannot be inferred reliably from config alone; it requires a load test in the target environment.

## Known micro-benchmarks (chain-order cache)
- Single order query: old path 2–5s; cache hit <10ms; cache miss 2–5s.
- Batch query (100 orders): old path 200–500s; cache hit ~100ms; cache miss 2–5s.
- Reported improvement: ~200–500x (single) and ~2000–5000x (batch).

## Core API endpoints (from code scan)
The list below comes from scanning all `packages/app/src/app/api/**/route.ts` files
and frontend fetch calls under `packages/app/src/app/**` on 2026-02-17.

### Client-facing endpoints referenced by UI
| Route | Methods | Notes |
|---|---|---|
| `/api/auth/session` | POST, DELETE | user session login/logout |
| `/api/orders` | GET, POST | list/search + create orders |
| `/api/orders/:orderId` | GET, PATCH, DELETE | order detail/update/delete |
| `/api/orders/:orderId/chain-sync` | POST | chain sync / refresh |
| `/api/pay` | POST | payment create |
| `/api/invoices` | POST | invoice create |
| `/api/players` | GET | player list |
| `/api/players/me/status` | GET, PATCH | user status |
| `/api/ledger/balance` | GET | balance |
| `/api/ledger/records` | GET | ledger records |
| `/api/guardians` | POST | guardian apply |
| `/api/guardians/status` | GET | guardian status |
| `/api/vip/tiers` | GET | vip tiers |
| `/api/vip/status` | GET | vip status |
| `/api/vip/request` | POST | vip request |
| `/api/mantou/balance` | GET | mantou balance |
| `/api/mantou/transactions` | GET | mantou transactions |
| `/api/mantou/withdraw` | GET, POST | mantou withdraw |
| `/api/coupons` | GET | coupons list |
| `/api/support` | POST | support ticket |
| `/api/track` | GET, POST | analytics beacon |
| `/api/chain/sponsor` | POST | chain sponsorship flow |
| `/api/mantou/credit` | POST | used by showcase page (dev/demo) |

### Public endpoints not referenced by UI (still routable)
- `/api/ledger/credit` (POST) – used by payment webhook/admin credit paths.
- `/api/mantou/seed` (POST) – seed/utility endpoint.

### All API routes (app router)
| Route | Methods | Category |
|---|---|---|
| /api/admin/analytics | GET | admin |
| /api/admin/announcements | GET, POST | admin |
| /api/admin/announcements/:announcementId | DELETE, PATCH | admin |
| /api/admin/announcements/bulk-delete | POST | admin |
| /api/admin/audit | GET | admin |
| /api/admin/chain/auto-cancel | POST | admin |
| /api/admin/chain/auto-finalize | POST | admin |
| /api/admin/chain/cache | DELETE, GET, POST | admin |
| /api/admin/chain/cancel | POST | admin |
| /api/admin/chain/cleanup-missing | POST | admin |
| /api/admin/chain/logs | DELETE, GET | admin |
| /api/admin/chain/order/:orderId | GET | admin |
| /api/admin/chain/orders | GET | admin |
| /api/admin/chain/reconcile | GET, POST | admin |
| /api/admin/chain/resolve | POST | admin |
| /api/admin/coupons | GET, POST | admin |
| /api/admin/coupons/:couponId | DELETE, PATCH | admin |
| /api/admin/guardians | GET, POST | admin |
| /api/admin/guardians/:applicationId | DELETE, PATCH | admin |
| /api/admin/invoices | GET, POST | admin |
| /api/admin/invoices/:invoiceId | DELETE, PATCH | admin |
| /api/admin/ledger/credit | POST | admin |
| /api/admin/login | POST | admin |
| /api/admin/logout | POST | admin |
| /api/admin/mantou/withdraws | GET | admin |
| /api/admin/mantou/withdraws/:requestId | PATCH | admin |
| /api/admin/me | GET | admin |
| /api/admin/orders | GET, POST | admin |
| /api/admin/orders/:orderId | GET, PATCH | admin |
| /api/admin/orders/bulk-delete | POST | admin |
| /api/admin/orders/cleanup-e2e | POST | admin |
| /api/admin/orders/export | GET | admin |
| /api/admin/payments | GET | admin |
| /api/admin/players | GET, POST | admin |
| /api/admin/players/:playerId | DELETE, PATCH | admin |
| /api/admin/players/bulk-delete | POST | admin |
| /api/admin/refresh | POST | admin |
| /api/admin/stats | GET | admin |
| /api/admin/support | GET, POST | admin |
| /api/admin/support/:ticketId | DELETE, PATCH | admin |
| /api/admin/tokens | GET, POST | admin |
| /api/admin/tokens/:tokenId | DELETE, PATCH | admin |
| /api/admin/vip/members | GET, POST | admin |
| /api/admin/vip/members/:memberId | DELETE, PATCH | admin |
| /api/admin/vip/requests | GET | admin |
| /api/admin/vip/requests/:requestId | DELETE, PATCH | admin |
| /api/admin/vip/tiers | GET, POST | admin |
| /api/admin/vip/tiers/:tierId | DELETE, PATCH | admin |
| /api/auth/session | DELETE, POST | public |
| /api/chain/sponsor | POST | public |
| /api/coupons | GET | public |
| /api/cron/chain-sync | GET | cron |
| /api/cron/chain/auto-cancel | GET | cron |
| /api/cron/chain/auto-finalize | GET | cron |
| /api/cron/chain/cleanup-missing | GET | cron |
| /api/cron/maintenance | GET | cron |
| /api/cron/pay/reconcile | GET | cron |
| /api/guardians | POST | public |
| /api/guardians/status | GET | public |
| /api/invoices | POST | public |
| /api/ledger/balance | GET | public |
| /api/ledger/credit | POST | public |
| /api/ledger/records | GET | public |
| /api/mantou/balance | GET | public |
| /api/mantou/credit | POST | public |
| /api/mantou/seed | POST | public |
| /api/mantou/transactions | GET | public |
| /api/mantou/withdraw | GET, POST | public |
| /api/orders | GET, POST | public |
| /api/orders/:orderId | DELETE, GET, PATCH | public |
| /api/orders/:orderId/chain-sync | POST | public |
| /api/pay | POST | public |
| /api/pay/webhook | POST | webhook |
| /api/players | GET | public |
| /api/players/me/status | GET, PATCH | public |
| /api/support | POST | public |
| /api/track | GET, POST | public |
| /api/vip/request | POST | public |
| /api/vip/status | GET | public |
| /api/vip/tiers | GET | public |

## Performance-related runtime knobs (from `packages/app/.env`)
Sensitive values (DB URLs, private keys, tokens, webhook secrets) are redacted.

### Rate limits / throttling
| Setting | Value | Notes |
|---|---:|---|
| `ADMIN_RATE_LIMIT_WINDOW_MS` | 60000 | Admin API rate-limit window |
| `ADMIN_RATE_LIMIT_MAX` | 120 | Max requests per window |
| `ADMIN_LOGIN_RATE_LIMIT_MAX` | 10 | Login attempts per window |
| `NEXT_PUBLIC_FETCH_THROTTLE_SCOPE` | api | Client throttling scope |
| `NEXT_PUBLIC_FETCH_THROTTLE_EXCLUDE` | (empty) | Client throttling exclude list |

### Caching / polling
| Setting | Value | Notes |
|---|---:|---|
| `NEXT_PUBLIC_FETCH_MIN_INTERVAL_MS` | 2000 | Client polling minimum interval |
| `NEXT_PUBLIC_FETCH_CACHE_TTL_MS` | 2000 | Client cache TTL |
| `CHAIN_ORDER_CACHE_TTL_MS` | 30000 | Chain order cache TTL |
| `CHAIN_ORDER_MAX_CACHE_AGE_MS` | 300000 | Max cache age |
| `NEXT_PUBLIC_QY_EVENT_MIN_INTERVAL_MS` | 60000 | Event fetch min interval |

### Event limits / retention
| Setting | Value | Notes |
|---|---:|---|
| `ADMIN_CHAIN_EVENT_LIMIT` | 1000 | Admin chain event list cap |
| `ADMIN_AUDIT_LOG_LIMIT` | 1000 | Admin audit log cap |
| `ADMIN_PAYMENT_EVENT_LIMIT` | 1000 | Admin payment event cap |
| `NEXT_PUBLIC_QY_EVENT_LIMIT` | 200 | Client event list cap |
| `ORDER_RETENTION_DAYS` | 180 | Server-side order retention |

### Background cleanup / automation
| Setting | Value | Notes |
|---|---:|---|
| `CHAIN_MISSING_CLEANUP_ENABLED` | 0 | Cleanup toggle |
| `CHAIN_MISSING_CLEANUP_MAX_AGE_HOURS` | 720 | Max age for cleanup |
| `CHAIN_MISSING_CLEANUP_MAX` | 500 | Cleanup batch cap |
| `CHAIN_ORDER_AUTO_CANCEL_HOURS` | 24 | Auto-cancel threshold |
| `CHAIN_ORDER_AUTO_CANCEL_MAX` | 10 | Auto-cancel batch cap |
| `CHAIN_ORDER_AUTO_COMPLETE_HOURS` | 24 | Auto-complete threshold |
| `CHAIN_ORDER_AUTO_COMPLETE_MAX` | 10 | Auto-complete batch cap |
| `CHAIN_ORDER_AUTO_FINALIZE_MAX` | 10 | Auto-finalize batch cap |

### Session / auth
| Setting | Value | Notes |
|---|---:|---|
| `ADMIN_SESSION_TTL_HOURS` | 12 | Admin session TTL |
| `USER_SESSION_TTL_HOURS` | 12 | User session TTL |

### DB connection hints
| Setting | Value | Notes |
|---|---|---|
| `DATABASE_POOL_URL` | (empty) | Pooler not configured in `.env` |
| `PRISMA_CONNECTION_LIMIT` | (empty) | Prisma default limit |
| `PRISMA_POOL_TIMEOUT` | (empty) | Prisma default timeout |

### Observability sampling
| Setting | Value | Notes |
|---|---:|---|
| `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | 0.1 | Client trace sampling |
| `SENTRY_TRACES_SAMPLE_RATE` | 0.1 | Server trace sampling |

## Why capacity cannot be derived from `.env`
Actual capacity depends on deployment size, DB performance, RPC latency, caching hit rate, and traffic mix. Configuration alone does not provide throughput or concurrency limits.

## Suggested next step to estimate “how many users”
Run a load test against the target environment (staging or prod-like), focusing on the busiest flows (login, order create, order list, chain sync). Capture P95/P99 latency and error rate, then extrapolate concurrency from the observed QPS.
