# Cloudflare API Route Runtime Matrix

Generated at: `2026-03-04T15:16:48.365Z`

## Rules
- `DB-edge-candidate`: import graph touches Prisma (`@/lib/db` or `@prisma/client`).
- `Node-bound`: explicit `runtime = "nodejs"` or Node-core / node-only package signals.
- `CF-safe`: no Prisma and no node-bound signals found by static scan.

## Summary

| Class | Count |
| --- | ---: |
| CF-safe | 136 |
| DB-edge-candidate | 0 |
| Node-bound | 0 |
| Total | 136 |

## Route Matrix

| Route | Methods | Runtime | Class | Owner | Migration Status | Signals |
| --- | --- | --- | --- | --- | --- | --- |
| `/api/admin/analytics` | `GET` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/analytics/trend` | `GET` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/announcements` | `GET,POST` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/announcements/[announcementId]` | `PATCH,DELETE` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/announcements/bulk-delete` | `POST` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/audit` | `GET` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/backup` | `GET` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/chain/auto-cancel` | `POST` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/chain/auto-finalize` | `POST` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/chain/cache` | `GET,POST,DELETE` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/chain/cancel` | `POST` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/chain/cleanup-missing` | `POST` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/chain/logs` | `GET,DELETE` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/chain/order/[orderId]` | `GET` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/chain/orders` | `GET` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/chain/reconcile` | `GET,POST` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/chain/resolve` | `POST` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/coupons` | `GET,POST` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/coupons/[couponId]` | `PATCH,DELETE` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/customer-tags` | `GET,POST,DELETE` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/dashboard` | `GET` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/disputes` | `POST` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/earnings` | `GET` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/examiners` | `GET,POST` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/examiners/[applicationId]` | `PATCH,DELETE` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/feature-flags` | `GET,POST` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/guardians` | `GET,POST` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/guardians/[applicationId]` | `PATCH,DELETE` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/invoices` | `GET,POST` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/invoices/[invoiceId]` | `PATCH,DELETE` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/kook` | `GET,POST` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/ledger/credit` | `POST` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/live-applications` | `GET,POST` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/live-applications/[applicationId]` | `PATCH,DELETE` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/login` | `POST` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/logout` | `POST` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/mantou/withdraws` | `GET` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/mantou/withdraws/[requestId]` | `PATCH` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/me` | `GET` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/orders` | `GET,POST` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/orders/[orderId]` | `GET,PATCH` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/orders/bulk-delete` | `POST` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/orders/cleanup-e2e` | `POST` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/orders/export` | `GET` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/payments` | `GET` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/performance` | `GET` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/players` | `GET,POST` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/players/[playerId]` | `PATCH,DELETE` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/players/bulk-delete` | `POST` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/reconcile` | `GET,POST` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/redeem/codes` | `GET,POST` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/redeem/codes/[codeId]` | `PATCH` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/redeem/records` | `GET` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/referral/config` | `GET,PUT` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/referral/list` | `GET` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/refresh` | `POST` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/revenue` | `GET` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/stats` | `GET` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/support` | `GET,POST` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/support/[ticketId]` | `PATCH,DELETE` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/tokens` | `GET,POST` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/tokens/[tokenId]` | `PATCH,DELETE` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/vip/members` | `GET,POST` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/vip/members/[memberId]` | `PATCH,DELETE` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/vip/requests` | `GET` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/vip/requests/[requestId]` | `PATCH,DELETE` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/vip/tiers` | `GET,POST` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/admin/vip/tiers/[tierId]` | `PATCH,DELETE` | `unspecified` | `CF-safe` | `admin` | `ready` | - |
| `/api/announcements` | `GET` | `unspecified` | `CF-safe` | `content` | `ready` | - |
| `/api/auth/mini` | `POST` | `unspecified` | `CF-safe` | `auth` | `ready` | - |
| `/api/auth/session` | `GET,POST,DELETE` | `unspecified` | `CF-safe` | `auth` | `ready` | - |
| `/api/chain/duo-mark-completed` | `POST` | `unspecified` | `CF-safe` | `chain` | `ready` | - |
| `/api/chain/mark-completed` | `POST` | `unspecified` | `CF-safe` | `chain` | `ready` | - |
| `/api/chain/sponsor` | `POST` | `unspecified` | `CF-safe` | `chain` | `ready` | - |
| `/api/companion/customer-tags` | `GET,POST` | `unspecified` | `CF-safe` | `companion` | `ready` | - |
| `/api/companion/duo-orders` | `GET` | `unspecified` | `CF-safe` | `companion` | `ready` | - |
| `/api/companion/orders` | `GET` | `unspecified` | `CF-safe` | `companion` | `ready` | - |
| `/api/companion/schedule` | `GET,PUT` | `unspecified` | `CF-safe` | `companion` | `ready` | - |
| `/api/companion/stats` | `GET` | `unspecified` | `CF-safe` | `companion` | `ready` | - |
| `/api/coupons` | `GET` | `unspecified` | `CF-safe` | `growth` | `ready` | - |
| `/api/cron/backup` | `GET` | `unspecified` | `CF-safe` | `platform` | `ready` | - |
| `/api/cron/chain-sync` | `GET` | `unspecified` | `CF-safe` | `platform` | `ready` | - |
| `/api/cron/chain/auto-cancel` | `GET` | `unspecified` | `CF-safe` | `platform` | `ready` | - |
| `/api/cron/chain/auto-finalize` | `GET` | `unspecified` | `CF-safe` | `platform` | `ready` | - |
| `/api/cron/chain/cleanup-missing` | `GET` | `unspecified` | `CF-safe` | `platform` | `ready` | - |
| `/api/cron/cleanup` | `GET` | `unspecified` | `CF-safe` | `platform` | `ready` | - |
| `/api/cron/maintenance` | `GET` | `unspecified` | `CF-safe` | `platform` | `ready` | - |
| `/api/cron/pay/reconcile` | `GET` | `unspecified` | `CF-safe` | `platform` | `ready` | - |
| `/api/cron/sponsor-check` | `GET` | `unspecified` | `CF-safe` | `platform` | `ready` | - |
| `/api/disputes` | `GET,POST` | `unspecified` | `CF-safe` | `ops` | `ready` | - |
| `/api/duo-orders` | `GET,POST` | `unspecified` | `CF-safe` | `orders` | `ready` | - |
| `/api/duo-orders/[orderId]` | `GET,PATCH` | `unspecified` | `CF-safe` | `orders` | `ready` | - |
| `/api/duo-orders/[orderId]/claim-slot` | `POST` | `unspecified` | `CF-safe` | `orders` | `ready` | - |
| `/api/duo-orders/[orderId]/release-slot` | `POST` | `unspecified` | `CF-safe` | `orders` | `ready` | - |
| `/api/events` | `GET` | `unspecified` | `CF-safe` | `realtime` | `ready` | - |
| `/api/examiners` | `POST` | `unspecified` | `CF-safe` | `ops` | `ready` | - |
| `/api/guardians` | `POST` | `unspecified` | `CF-safe` | `ops` | `ready` | - |
| `/api/guardians/status` | `GET` | `unspecified` | `CF-safe` | `ops` | `ready` | - |
| `/api/health` | `GET` | `unspecified` | `CF-safe` | `platform` | `ready` | - |
| `/api/invoices` | `POST` | `unspecified` | `CF-safe` | `finance` | `ready` | - |
| `/api/kook/webhook` | `POST` | `unspecified` | `CF-safe` | `integrations` | `ready` | - |
| `/api/ledger/balance` | `GET` | `unspecified` | `CF-safe` | `ledger` | `ready` | - |
| `/api/ledger/credit` | `POST` | `unspecified` | `CF-safe` | `ledger` | `ready` | - |
| `/api/ledger/records` | `GET` | `unspecified` | `CF-safe` | `ledger` | `ready` | - |
| `/api/live-applications` | `POST` | `unspecified` | `CF-safe` | `ops` | `ready` | - |
| `/api/mantou/balance` | `GET` | `unspecified` | `CF-safe` | `ledger` | `ready` | - |
| `/api/mantou/credit` | `POST` | `unspecified` | `CF-safe` | `ledger` | `ready` | - |
| `/api/mantou/seed` | `POST` | `unspecified` | `CF-safe` | `ledger` | `ready` | - |
| `/api/mantou/transactions` | `GET` | `unspecified` | `CF-safe` | `ledger` | `ready` | - |
| `/api/mantou/withdraw` | `GET,POST` | `unspecified` | `CF-safe` | `ledger` | `ready` | - |
| `/api/notifications` | `GET,PATCH,DELETE` | `unspecified` | `CF-safe` | `growth` | `ready` | - |
| `/api/orders` | `GET,POST` | `unspecified` | `CF-safe` | `orders` | `ready` | - |
| `/api/orders/[orderId]` | `GET,PATCH,DELETE` | `unspecified` | `CF-safe` | `orders` | `ready` | - |
| `/api/orders/[orderId]/chain-sync` | `POST` | `unspecified` | `CF-safe` | `orders` | `ready` | - |
| `/api/orders/[orderId]/review` | `GET,POST` | `unspecified` | `CF-safe` | `orders` | `ready` | - |
| `/api/pay` | `POST` | `unspecified` | `CF-safe` | `payments` | `ready` | - |
| `/api/pay/precreate` | `POST` | `unspecified` | `CF-safe` | `payments` | `ready` | - |
| `/api/pay/webhook` | `POST` | `unspecified` | `CF-safe` | `payments` | `ready` | - |
| `/api/players` | `GET` | `unspecified` | `CF-safe` | `growth` | `ready` | - |
| `/api/players/[playerId]/reviews` | `GET` | `unspecified` | `CF-safe` | `growth` | `ready` | - |
| `/api/players/me/status` | `GET,PATCH` | `unspecified` | `CF-safe` | `growth` | `ready` | - |
| `/api/push/subscribe` | `POST,DELETE` | `unspecified` | `CF-safe` | `growth` | `ready` | - |
| `/api/redeem` | `POST` | `unspecified` | `CF-safe` | `growth` | `ready` | - |
| `/api/referral/bind` | `POST` | `unspecified` | `CF-safe` | `growth` | `ready` | - |
| `/api/referral/leaderboard` | `GET` | `unspecified` | `CF-safe` | `growth` | `ready` | - |
| `/api/referral/status` | `GET` | `unspecified` | `CF-safe` | `growth` | `ready` | - |
| `/api/support` | `POST` | `unspecified` | `CF-safe` | `support` | `ready` | - |
| `/api/support/my-tickets` | `GET` | `unspecified` | `CF-safe` | `support` | `ready` | - |
| `/api/track` | `GET,POST` | `unspecified` | `CF-safe` | `growth` | `ready` | - |
| `/api/user/coupons` | `GET,POST` | `unspecified` | `CF-safe` | `user` | `ready` | - |
| `/api/user/level` | `GET,POST` | `unspecified` | `CF-safe` | `user` | `ready` | - |
| `/api/v1/[[...path]]` | `GET,POST,PUT,PATCH,DELETE` | `unspecified` | `CF-safe` | `platform` | `ready` | - |
| `/api/vip/request` | `POST` | `unspecified` | `CF-safe` | `vip` | `ready` | - |
| `/api/vip/status` | `GET` | `unspecified` | `CF-safe` | `vip` | `ready` | - |
| `/api/vip/tiers` | `GET` | `unspecified` | `CF-safe` | `vip` | `ready` | - |
| `/api/vitals` | `GET,POST` | `unspecified` | `CF-safe` | `platform` | `ready` | - |

## Notes
- This is a static dependency scan and may under/over-report in dynamic import branches.
- Re-generate after major route or data-layer changes.

