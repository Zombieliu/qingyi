import type { AdminRole } from "./admin-types";

/**
 * Fine-grained permission system.
 * Each permission maps to the minimum role required.
 */
export type Permission =
  // Orders
  | "orders.view"
  | "orders.edit"
  | "orders.delete"
  | "orders.export"
  | "orders.dispute_resolve"
  // Players
  | "players.view"
  | "players.edit"
  | "players.credit"
  // Finance
  | "finance.view"
  | "finance.ledger"
  | "finance.invoices"
  | "finance.refund"
  // Users
  | "users.view"
  | "users.membership"
  | "users.coupons"
  // System
  | "system.settings"
  | "system.feature_flags"
  | "system.audit_log"
  | "system.announcements"
  // Data
  | "data.dashboard"
  | "data.revenue"
  | "data.export";

const PERMISSION_MAP: Record<Permission, AdminRole> = {
  // Orders
  "orders.view": "viewer",
  "orders.edit": "ops",
  "orders.delete": "admin",
  "orders.export": "ops",
  "orders.dispute_resolve": "ops",
  // Players
  "players.view": "viewer",
  "players.edit": "ops",
  "players.credit": "finance",
  // Finance
  "finance.view": "finance",
  "finance.ledger": "finance",
  "finance.invoices": "finance",
  "finance.refund": "admin",
  // Users
  "users.view": "viewer",
  "users.membership": "ops",
  "users.coupons": "ops",
  // System
  "system.settings": "admin",
  "system.feature_flags": "admin",
  "system.audit_log": "admin",
  "system.announcements": "ops",
  // Data
  "data.dashboard": "viewer",
  "data.revenue": "finance",
  "data.export": "ops",
};

const ROLE_RANK: Record<AdminRole, number> = {
  admin: 4,
  finance: 3,
  ops: 2,
  viewer: 1,
};

/** Check if a role has a specific permission */
export function hasPermission(role: AdminRole, permission: Permission): boolean {
  const required = PERMISSION_MAP[permission];
  if (!required) return false;
  return ROLE_RANK[role] >= ROLE_RANK[required];
}

/** Get all permissions for a role */
export function getPermissions(role: AdminRole): Permission[] {
  return (Object.keys(PERMISSION_MAP) as Permission[]).filter((p) => hasPermission(role, p));
}

/** Get minimum role for a permission */
export function getMinRole(permission: Permission): AdminRole {
  return PERMISSION_MAP[permission] || "admin";
}
