# Edge DB Migration Inventory (Current Status)

Generated at: `2026-03-04T15:16:48.365Z`

## Current Summary
- `CF_SAFE_ROUTES=136`
- `DB_EDGE_CANDIDATES=0`
- `NODE_BOUND_ROUTES=0`
- Total inventoried API routes: **136**
- Current state: **all API routes are now CF-safe in static import-graph classification.**
- Residual shape: **no Prisma or Node-only static signals remain in API route graph.**

## Completed Coverage
- Public read routes (including announcements/referral/vip tiers)
- Authenticated read routes (including companion + vip status)
- Write routes with idempotency safeguards and edge-safe runtime dependencies
- Admin read/write route groups (analytics, dashboard, revenue, performance, redeem, orders, players, support, vip, chain, finance)
- Cron maintenance and payment reconciliation routes
- Auth mini-program/session + pay/redeem/review route groups
- Admin auth-adjacent operational routes (`login/logout/refresh/tokens`) and push subscribe flow are now CF-safe.

## Post-Migration Hardening
- Shared Edge DB scan/pagination/date-normalization helpers are centralized under `packages/app/src/lib/edge-db`.
- Runtime crypto, trace-id, and cron authorization helpers are now WebCrypto-compatible and edge-safe.
- Admin auth now uses edge-compatible session/token store access with Prisma fallback for non-edge environments.
- Admin audit writes now use edge-compatible writes with Prisma fallback for non-edge environments.
- User auth now uses edge-compatible session store access with Prisma fallback for non-edge environments.
- Push service now lazy-loads `web-push`, so subscription APIs remain edge-safe while preserving push delivery behavior.
- Stripe clients are now runtime-loaded via edge-safe wrappers to avoid static Node-only coupling in route graphs.
- `admin-store` and related service boundaries now use edge-safe facades with dynamic legacy fallback loading.
- Chain cursor, notification, and growth hot paths now have edge-first data access with runtime fallback paths.
- Route-level dynamic imports were normalized for remaining Prisma-coupled service boundaries to prevent static graph regressions.
- Deterministic unit tests and API suites cover shared helpers and touched route normalization/auth paths.

## Notes
- Route-level responses and status codes are preserved for touched routes; refactors are internal.
- Source of truth for per-route status is `docs/cloudflare-api-route-matrix.md`.
- Regression baseline: `pnpm --filter app test -- src/app/api` => `125 files`, `1029 tests` passed.
