# Edge DB Migration Inventory (Remaining APIs)

Generated at: `2026-03-04T07:45:38.438Z`

## Scope
- Existing migrated public reads: `/api/announcements`, `/api/referral/leaderboard`, `/api/vip/tiers`
- Remaining DB-backed routes inventoried: **128**
- Risk distribution: low=7, medium=3, high=118

## Inventory

| Route | Current Data Path | Target Edge-Compatible Path | Risk |
| --- | --- | --- | --- |
| `/api/admin/analytics` | route -> @/lib/db prisma | `@/lib/edge-db/admin-read-store` | `high` |
| `/api/admin/analytics/trend` | route -> @/lib/db prisma | `@/lib/edge-db/admin-read-store` | `high` |
| `/api/admin/announcements` | route -> admin-store -> prisma | `@/lib/edge-db/admin-store (split read/write helpers)` | `high` |
| `/api/admin/announcements/[announcementId]` | route -> admin-store -> prisma | `@/lib/edge-db/admin-write-store` | `high` |
| `/api/admin/announcements/bulk-delete` | route -> admin-store -> prisma | `@/lib/edge-db/admin-write-store` | `high` |
| `/api/admin/audit` | route -> admin-store -> prisma | `@/lib/edge-db/admin-read-store` | `high` |
| `/api/admin/backup` | route import graph -> @/lib/db prisma | `@/lib/edge-db/admin-read-store` | `high` |
| `/api/admin/chain/auto-cancel` | route import graph -> @/lib/db prisma | `@/lib/edge-db/admin-write-store` | `high` |
| `/api/admin/chain/auto-finalize` | route import graph -> @/lib/db prisma | `@/lib/edge-db/admin-write-store` | `high` |
| `/api/admin/chain/cache` | route import graph -> @/lib/db prisma | `@/lib/edge-db/admin-store (split read/write helpers)` | `high` |
| `/api/admin/chain/cancel` | route import graph -> @/lib/db prisma | `@/lib/edge-db/admin-write-store` | `high` |
| `/api/admin/chain/cleanup-missing` | route -> admin-store -> prisma | `@/lib/edge-db/admin-write-store` | `high` |
| `/api/admin/chain/logs` | route import graph -> @/lib/db prisma | `@/lib/edge-db/admin-store (split read/write helpers)` | `high` |
| `/api/admin/chain/order/[orderId]` | route -> admin-store -> prisma | `@/lib/edge-db/admin-read-store` | `high` |
| `/api/admin/chain/orders` | route -> admin-store -> prisma | `@/lib/edge-db/admin-read-store` | `high` |
| `/api/admin/chain/reconcile` | route -> @/lib/db prisma | `@/lib/edge-db/admin-store (split read/write helpers)` | `high` |
| `/api/admin/chain/resolve` | route -> service-layer -> prisma | `@/lib/edge-db/admin-write-store` | `high` |
| `/api/admin/coupons` | route -> admin-store -> prisma | `@/lib/edge-db/admin-store (split read/write helpers)` | `high` |
| `/api/admin/coupons/[couponId]` | route -> admin-store -> prisma | `@/lib/edge-db/admin-write-store` | `high` |
| `/api/admin/customer-tags` | route -> service-layer -> prisma | `@/lib/edge-db/admin-store (split read/write helpers)` | `high` |
| `/api/admin/dashboard` | route -> @/lib/db prisma | `@/lib/edge-db/admin-read-store` | `high` |
| `/api/admin/disputes` | route -> service-layer -> prisma | `@/lib/edge-db/admin-write-store` | `high` |
| `/api/admin/earnings` | route -> admin-store -> prisma | `@/lib/edge-db/admin-read-store` | `high` |
| `/api/admin/examiners` | route -> admin-store -> prisma | `@/lib/edge-db/admin-store (split read/write helpers)` | `high` |
| `/api/admin/examiners/[applicationId]` | route -> admin-store -> prisma | `@/lib/edge-db/admin-write-store` | `high` |
| `/api/admin/feature-flags` | route import graph -> @/lib/db prisma | `@/lib/edge-db/admin-store (split read/write helpers)` | `high` |
| `/api/admin/guardians` | route -> admin-store -> prisma | `@/lib/edge-db/admin-store (split read/write helpers)` | `high` |
| `/api/admin/guardians/[applicationId]` | route -> admin-store -> prisma | `@/lib/edge-db/admin-write-store` | `high` |
| `/api/admin/invoices` | route -> admin-store -> prisma | `@/lib/edge-db/admin-store (split read/write helpers)` | `high` |
| `/api/admin/invoices/[invoiceId]` | route -> admin-store -> prisma | `@/lib/edge-db/admin-write-store` | `high` |
| `/api/admin/kook` | route -> service-layer -> prisma | `@/lib/edge-db/admin-store (split read/write helpers)` | `high` |
| `/api/admin/ledger/credit` | route import graph -> @/lib/db prisma | `@/lib/edge-db/admin-write-store` | `high` |
| `/api/admin/live-applications` | route -> admin-store -> prisma | `@/lib/edge-db/admin-store (split read/write helpers)` | `high` |
| `/api/admin/live-applications/[applicationId]` | route -> admin-store -> prisma | `@/lib/edge-db/admin-write-store` | `high` |
| `/api/admin/login` | route -> admin-store -> prisma | `@/lib/edge-db/admin-write-store` | `high` |
| `/api/admin/logout` | route import graph -> @/lib/db prisma | `@/lib/edge-db/admin-write-store` | `high` |
| `/api/admin/mantou/withdraws` | route -> admin-store -> prisma | `@/lib/edge-db/admin-read-store` | `high` |
| `/api/admin/mantou/withdraws/[requestId]` | route -> admin-store -> prisma | `@/lib/edge-db/admin-write-store` | `high` |
| `/api/admin/me` | route import graph -> @/lib/db prisma | `@/lib/edge-db/admin-read-store` | `high` |
| `/api/admin/orders` | route -> admin-store -> prisma | `@/lib/edge-db/admin-store (split read/write helpers)` | `high` |
| `/api/admin/orders/[orderId]` | route -> admin-store -> prisma | `@/lib/edge-db/admin-store (split read/write helpers)` | `high` |
| `/api/admin/orders/bulk-delete` | route -> admin-store -> prisma | `@/lib/edge-db/admin-write-store` | `high` |
| `/api/admin/orders/cleanup-e2e` | route -> admin-store -> prisma | `@/lib/edge-db/admin-write-store` | `high` |
| `/api/admin/orders/export` | route -> admin-store -> prisma | `@/lib/edge-db/admin-read-store` | `high` |
| `/api/admin/payments` | route -> admin-store -> prisma | `@/lib/edge-db/admin-read-store` | `high` |
| `/api/admin/performance` | route -> @/lib/db prisma | `@/lib/edge-db/admin-read-store` | `high` |
| `/api/admin/players` | route -> admin-store -> prisma | `@/lib/edge-db/admin-store (split read/write helpers)` | `high` |
| `/api/admin/players/[playerId]` | route -> admin-store -> prisma | `@/lib/edge-db/admin-write-store` | `high` |
| `/api/admin/players/bulk-delete` | route -> admin-store -> prisma | `@/lib/edge-db/admin-write-store` | `high` |
| `/api/admin/reconcile` | route -> service-layer -> prisma | `@/lib/edge-db/admin-store (split read/write helpers)` | `high` |
| `/api/admin/redeem/codes` | route -> @/lib/db prisma | `@/lib/edge-db/admin-store (split read/write helpers)` | `high` |
| `/api/admin/redeem/codes/[codeId]` | route -> @/lib/db prisma | `@/lib/edge-db/admin-write-store` | `high` |
| `/api/admin/redeem/records` | route import graph -> @/lib/db prisma | `@/lib/edge-db/admin-read-store` | `high` |
| `/api/admin/referral/config` | route -> admin-store -> prisma | `@/lib/edge-db/admin-store (split read/write helpers)` | `high` |
| `/api/admin/referral/list` | route -> admin-store -> prisma | `@/lib/edge-db/admin-read-store` | `high` |
| `/api/admin/refresh` | route import graph -> @/lib/db prisma | `@/lib/edge-db/admin-write-store` | `high` |
| `/api/admin/revenue` | route -> @/lib/db prisma | `@/lib/edge-db/admin-read-store` | `high` |
| `/api/admin/stats` | route -> admin-store -> prisma | `@/lib/edge-db/admin-read-store` | `high` |
| `/api/admin/support` | route -> admin-store -> prisma | `@/lib/edge-db/admin-store (split read/write helpers)` | `high` |
| `/api/admin/support/[ticketId]` | route -> admin-store -> prisma | `@/lib/edge-db/admin-write-store` | `high` |
| `/api/admin/tokens` | route -> admin-store -> prisma | `@/lib/edge-db/admin-store (split read/write helpers)` | `high` |
| `/api/admin/tokens/[tokenId]` | route -> admin-store -> prisma | `@/lib/edge-db/admin-write-store` | `high` |
| `/api/admin/vip/members` | route -> admin-store -> prisma | `@/lib/edge-db/admin-store (split read/write helpers)` | `high` |
| `/api/admin/vip/members/[memberId]` | route -> admin-store -> prisma | `@/lib/edge-db/admin-write-store` | `high` |
| `/api/admin/vip/requests` | route -> admin-store -> prisma | `@/lib/edge-db/admin-read-store` | `high` |
| `/api/admin/vip/requests/[requestId]` | route -> admin-store -> prisma | `@/lib/edge-db/admin-write-store` | `high` |
| `/api/admin/vip/tiers` | route -> admin-store -> prisma | `@/lib/edge-db/admin-store (split read/write helpers)` | `high` |
| `/api/admin/vip/tiers/[tierId]` | route -> admin-store -> prisma | `@/lib/edge-db/admin-write-store` | `high` |
| `/api/auth/mini` | route -> @/lib/db prisma | `@/lib/edge-db/auth-write-store` | `high` |
| `/api/auth/session` | route import graph -> @/lib/db prisma | `@/lib/edge-db/auth-store (split read/write helpers)` | `high` |
| `/api/chain/duo-mark-completed` | route import graph -> @/lib/db prisma | `@/lib/edge-db/chain-write-store` | `high` |
| `/api/chain/mark-completed` | route import graph -> @/lib/db prisma | `@/lib/edge-db/chain-write-store` | `high` |
| `/api/companion/customer-tags` | route -> service-layer -> prisma | `@/lib/edge-db/companion-store (split read/write helpers)` | `high` |
| `/api/companion/duo-orders` | route -> @/lib/db prisma | `@/lib/edge-db/companion-read-store` | `low` |
| `/api/companion/orders` | route -> @/lib/db prisma | `@/lib/edge-db/companion-read-store` | `low` |
| `/api/companion/schedule` | route -> @/lib/db prisma | `@/lib/edge-db/companion-store (split read/write helpers)` | `high` |
| `/api/companion/stats` | route -> @/lib/db prisma | `@/lib/edge-db/companion-read-store` | `low` |
| `/api/coupons` | route -> admin-store -> prisma | `@/lib/edge-db/coupons-read-store` | `high` |
| `/api/cron/backup` | route import graph -> @/lib/db prisma | `@/lib/edge-db/cron-read-store` | `medium` |
| `/api/cron/chain-sync` | route import graph -> @/lib/db prisma | `@/lib/edge-db/cron-read-store` | `high` |
| `/api/cron/chain/auto-cancel` | route import graph -> @/lib/db prisma | `@/lib/edge-db/cron-read-store` | `high` |
| `/api/cron/chain/auto-finalize` | route import graph -> @/lib/db prisma | `@/lib/edge-db/cron-read-store` | `high` |
| `/api/cron/chain/cleanup-missing` | route -> admin-store -> prisma | `@/lib/edge-db/cron-read-store` | `high` |
| `/api/cron/cleanup` | route -> @/lib/db prisma | `@/lib/edge-db/cron-read-store` | `medium` |
| `/api/cron/maintenance` | route -> @/lib/db prisma | `@/lib/edge-db/cron-read-store` | `medium` |
| `/api/cron/pay/reconcile` | route -> @/lib/db prisma | `@/lib/edge-db/cron-read-store` | `high` |
| `/api/disputes` | route -> service-layer -> prisma | `@/lib/edge-db/disputes-store (split read/write helpers)` | `high` |
| `/api/duo-orders` | route import graph -> @/lib/db prisma | `@/lib/edge-db/duo-orders-store (split read/write helpers)` | `high` |
| `/api/duo-orders/[orderId]` | route import graph -> @/lib/db prisma | `@/lib/edge-db/duo-orders-store (split read/write helpers)` | `high` |
| `/api/duo-orders/[orderId]/claim-slot` | route -> admin-store -> prisma | `@/lib/edge-db/duo-orders-write-store` | `high` |
| `/api/duo-orders/[orderId]/release-slot` | route import graph -> @/lib/db prisma | `@/lib/edge-db/duo-orders-write-store` | `high` |
| `/api/events` | route import graph -> @/lib/db prisma | `@/lib/edge-db/events-read-store` | `low` |
| `/api/examiners` | route -> admin-store -> prisma | `@/lib/edge-db/examiners-write-store` | `high` |
| `/api/guardians` | route -> admin-store -> prisma | `@/lib/edge-db/guardians-write-store` | `high` |
| `/api/guardians/status` | route -> admin-store -> prisma | `@/lib/edge-db/guardians-read-store` | `high` |
| `/api/health` | route -> @/lib/db prisma | `@/lib/edge-db/health-read-store` | `low` |
| `/api/invoices` | route -> admin-store -> prisma | `@/lib/edge-db/invoices-write-store` | `high` |
| `/api/ledger/credit` | route -> ledger modules -> prisma | `@/lib/edge-db/ledger-write-store` | `high` |
| `/api/ledger/records` | route -> admin-store -> prisma | `@/lib/edge-db/ledger-read-store` | `high` |
| `/api/live-applications` | route -> admin-store -> prisma | `@/lib/edge-db/live-applications-write-store` | `high` |
| `/api/mantou/balance` | route -> admin-store -> prisma | `@/lib/edge-db/mantou-read-store` | `high` |
| `/api/mantou/credit` | route -> admin-store -> prisma | `@/lib/edge-db/mantou-write-store` | `high` |
| `/api/mantou/seed` | route -> admin-store -> prisma | `@/lib/edge-db/mantou-write-store` | `high` |
| `/api/mantou/transactions` | route -> admin-store -> prisma | `@/lib/edge-db/mantou-read-store` | `high` |
| `/api/mantou/withdraw` | route -> admin-store -> prisma | `@/lib/edge-db/mantou-store (split read/write helpers)` | `high` |
| `/api/notifications` | route -> service-layer -> prisma | `@/lib/edge-db/notifications-store (split read/write helpers)` | `high` |
| `/api/orders` | route -> admin-store -> prisma | `@/lib/edge-db/orders-store (split read/write helpers)` | `high` |
| `/api/orders/[orderId]` | route -> admin-store -> prisma | `@/lib/edge-db/orders-store (split read/write helpers)` | `high` |
| `/api/orders/[orderId]/chain-sync` | route -> admin-store -> prisma | `@/lib/edge-db/orders-write-store` | `high` |
| `/api/orders/[orderId]/review` | route -> @/lib/db prisma | `@/lib/edge-db/orders-store (split read/write helpers)` | `high` |
| `/api/pay` | route -> admin-store -> prisma | `@/lib/edge-db/pay-write-store` | `high` |
| `/api/pay/precreate` | route import graph -> @/lib/db prisma | `@/lib/edge-db/pay-write-store` | `high` |
| `/api/pay/webhook` | route -> @/lib/db prisma | `@/lib/edge-db/pay-write-store` | `high` |
| `/api/players` | route -> admin-store -> prisma | `@/lib/edge-db/players-read-store` | `high` |
| `/api/players/[playerId]/reviews` | route -> @/lib/db prisma | `@/lib/edge-db/players-read-store` | `low` |
| `/api/players/me/status` | route -> admin-store -> prisma | `@/lib/edge-db/players-store (split read/write helpers)` | `high` |
| `/api/push/subscribe` | route -> service-layer -> prisma | `@/lib/edge-db/push-write-store` | `high` |
| `/api/redeem` | route -> redeem modules -> prisma | `@/lib/edge-db/redeem-write-store` | `high` |
| `/api/referral/bind` | route -> admin-store -> prisma | `@/lib/edge-db/referral-write-store` | `high` |
| `/api/referral/status` | route -> admin-store -> prisma | `@/lib/edge-db/referral-read-store` | `high` |
| `/api/support` | route -> admin-store -> prisma | `@/lib/edge-db/support-write-store` | `high` |
| `/api/support/my-tickets` | route -> admin-store-utils prisma | `@/lib/edge-db/support-read-store` | `low` |
| `/api/track` | route import graph -> @/lib/db prisma | `@/lib/edge-db/track-store (split read/write helpers)` | `high` |
| `/api/user/coupons` | route -> service-layer -> prisma | `@/lib/edge-db/user-store (split read/write helpers)` | `high` |
| `/api/user/level` | route -> service-layer -> prisma | `@/lib/edge-db/user-store (split read/write helpers)` | `high` |
| `/api/vip/request` | route -> admin-store -> prisma | `@/lib/edge-db/vip-write-store` | `high` |
| `/api/vip/status` | route -> admin-store -> prisma | `@/lib/edge-db/vip-read-store` | `high` |
| `/api/vitals` | route -> service-layer -> prisma | `@/lib/edge-db/vitals-store (split read/write helpers)` | `high` |

## Notes
- `Current Data Path` is inferred from route import graph and Prisma touchpoints.
- `Target Edge-Compatible Path` indicates the helper module namespace to migrate each route toward.
- Mixed read/write routes should be split by method while keeping response contracts unchanged.
