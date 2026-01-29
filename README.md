# Delta Monorepo

This repository is now a workspace root. The Next.js app lives in `packages/app`.

## Useful commands
- `npm run dev` – start the app workspace (`packages/app`)
- `npm run build` – build the app
- `npm run lint` – lint the app

## Structure
- `packages/app` – Next.js frontend (moved from previous root)
- future packages: `contracts/`, `api/`, `mobile/` can be added under `packages/`.

> After the move, regenerate lockfile with `npm install` at the repo root (npm workspaces). The old lockfile was moved to `packages/app/package-lock.json` for reference.
