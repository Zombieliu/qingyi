# Delta Monorepo

This repository is now a workspace root. The Next.js app lives in `packages/app`.

## Useful commands
- Node version: use 22.x (`.nvmrc` provided).
- `npm run dev` – start the app workspace (`packages/app`)
- `npm run build` – build the app
- `npm run lint` – lint the app
- `npm run test:flow` – run local flow smoke checks (API/admin; optional chain)
- `npm run test:admin:e2e` – run admin UI E2E (Playwright)
- `npm run test:chain:script` – run chain end-to-end script (requires SUI keys)
- `npm run chain:init-dapp` – init qy dapp tables on chain
- `npm run chain:init-ruleset` – create ruleset on chain
- `npm run db:push --workspace app` – apply Prisma schema to local Postgres
- `npm run db:seed --workspace app` – seed local Postgres data
- `npm run db:deploy --workspace app` – apply Prisma migrations
- `npm run db:maintain` – prune audit/payment tables by limits

## Environment variables
- 本地开发：复制 `packages/app/.env.example` 到 `packages/app/.env.local` 填写密钥。
- `packages/app/.env` 仅保留非敏感默认值（可留空），密钥只放 `.env.local`。
- 生产环境：在 Vercel 配置 Environment Variables（不要上传 `.env.local`）。
- 见 `OPTIMIZATION_TODO.md` 获取性能/稳定性优化清单。

## Flow test (local)
The flow script can start the dev server, run API/admin smoke checks, and optionally run chain E2E or ledger credit.

Examples:
```bash
npm run test:flow
npm run test:flow -- --chain
npm run test:flow -- --ledger
```

Optional env:
- `FLOW_BASE_URL` / `PLAYWRIGHT_BASE_URL` – override base URL (default `http://127.0.0.1:3000`)
- `ADMIN_DASH_TOKEN` or `LEDGER_ADMIN_TOKEN` – enable admin API checks
- `E2E_LEDGER_USER` – enable ledger credit check
- `NEXT_PUBLIC_ORDER_SOURCE=server` – use server-backed orders (recommended)
- `NEXT_PUBLIC_CHAIN_SPONSOR=auto|on|off` – enable sponsored gas (auto by default)

## Sponsored gas (Sui)
For chain orders, the app can sponsor user gas so wallets without SUI can still submit transactions.

Required env:
- `SUI_SPONSOR_PRIVATE_KEY` (or fallback to `SUI_ADMIN_PRIVATE_KEY`)
- `SUI_RPC_URL` + `SUI_NETWORK`
- `NEXT_PUBLIC_CHAIN_SPONSOR=on` (strict sponsor) or `auto` (fallback to self-pay)

Optional:
- `SUI_SPONSOR_GAS_BUDGET=50000000`

## Local Postgres (Docker)
```bash
docker compose up -d
```
Set `DATABASE_URL=postgresql://qingyi:qingyi@localhost:5432/qingyi?schema=public` in `.env.local`,
then run:
```bash
npm run db:deploy --workspace app
npm run db:seed --workspace app
```

## Supabase Postgres
Use Supabase as a remote Postgres by setting `DATABASE_URL` to the connection string from Supabase.

Recommended:
- `DATABASE_URL` → Supabase connection string (pooler or direct)
- For migrations, prefer running locally with the direct connection string

Example:
```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/postgres?schema=public
```

## One-step local init
```bash
node scripts/init-local.mjs
```

If you previously ran `db:push`, migrations can be baselined via:
```bash
npx prisma migrate resolve --schema packages/app/prisma/schema.prisma --applied 20260201_00_init_admin_store
```

## Cron (maintenance / chain sync)
- `GET /api/cron/maintenance`
- `GET /api/cron/chain-sync`

Use `CRON_SECRET` with `?token=` or `x-cron-secret` in production.

Optional env:
- `ORDER_RETENTION_DAYS` – delete orders older than N days (default 180)

## Structure
- `packages/app` – Next.js frontend (moved from previous root)
- future packages: `contracts/`, `api/`, `mobile/` can be added under `packages/`.

> After the move, regenerate lockfile with `npm install` at the repo root (npm workspaces). The old lockfile was moved to `packages/app/package-lock.json` for reference.
