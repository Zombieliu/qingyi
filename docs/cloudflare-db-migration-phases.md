# Cloudflare DB Migration Phases

This plan assumes the current goal is:
- Keep Cloudflare free-tier deployment working now
- Migrate DB-dependent APIs in controlled phases
- Preserve existing Vercel deployment as fallback during migration

## Phase 0: Baseline Locked (Done)

### Scope
- Keep script size below Cloudflare free compressed limit.
- Make `pnpm --filter app deploy` reproducible after fresh installs.
- Ensure homepage route is stable on Workers.

### Artifacts
- Route splitting in OpenNext config (`admin` separated from `default`).
- Cloudflare-only Sentry shim in `OPEN_NEXT_BUILD=1`.
- Auto patch step before `deploy/preview/upload`.

### Exit Criteria
- `pnpm --filter app deploy` succeeds repeatedly.
- Root route (`/`) returns `200` on workers.dev.

## Phase 1: Inventory and Segmentation

### Scope
- Classify API routes by runtime dependency:
  - `CF-safe`: no Prisma/Node-only modules
  - `DB-edge-candidate`: DB reads/writes that can move to HTTP-based drivers
  - `Node-bound`: currently depends on Node-only runtime behavior

### Deliverables
- Route matrix document with owner + migration status.
- Generated matrix artifact: `docs/cloudflare-api-route-matrix.md` (`pnpm --filter app run cf:matrix`).
- Temporary feature flag or routing policy for Node-bound endpoints.
  - `CF_NODE_BOUND_ROUTE_POLICY=block`
  - `CF_NODE_BOUND_ROUTE_PREFIXES=/api/announcements,/api/health,/api/vip/tiers` (comma-separated prefixes)

### Exit Criteria
- Every API route is tagged with one runtime class.
- Critical user flows have identified Cloudflare-safe endpoints.

## Phase 2: Edge-Compatible DB Access Pilot

### Scope
- Introduce one edge-compatible DB access path for selected endpoints.
- Keep Prisma Node path for remaining routes until replaced.

### Recommended Strategy
- Start with low-risk read endpoints.
- Move to an HTTP/edge-compatible DB client pattern.
- Keep strict observability for latency/error regression.

### Exit Criteria
- At least 3 representative DB-backed endpoints run on Cloudflare.
- No regression in functional tests for those endpoints.

## Phase 3: Progressive DB Route Migration

### Scope
- Migrate medium/critical DB routes in batches.
- Remove Node-only fallbacks route-by-route.

### Batch Order
1. Public read endpoints
2. Authenticated read endpoints
3. Write endpoints with idempotency safeguards
4. Admin write endpoints

### Exit Criteria
- All target production routes run without Node-only runtime modules.
- Error budget and p95 latency meet baseline targets.

## Phase 4: Cleanup and Hardening

### Scope
- Remove temporary compatibility shims no longer needed.
- Minimize custom OpenNext patch surface.
- Add CI checks to prevent regression.

### CI Checks
- Verify Cloudflare bundle gzip size stays < 3 MiB.
- Verify `pnpm --filter app deploy` dry-run build path.
- Smoke test root + selected API endpoints post-build.

### Exit Criteria
- Cloudflare path is primary and stable.
- Vercel remains optional fallback, not required for core traffic.
