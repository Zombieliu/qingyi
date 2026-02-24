import { describe, it, expect } from "vitest";
import { hasPermission, getPermissions, getMinRole } from "../admin-permissions";
import type { Permission } from "../admin-permissions";

describe("hasPermission", () => {
  it("admin has all permissions", () => {
    const all: Permission[] = [
      "orders.view",
      "orders.edit",
      "orders.delete",
      "orders.export",
      "orders.dispute_resolve",
      "players.view",
      "players.edit",
      "players.credit",
      "finance.view",
      "finance.ledger",
      "finance.invoices",
      "finance.refund",
      "users.view",
      "users.membership",
      "users.coupons",
      "system.settings",
      "system.feature_flags",
      "system.audit_log",
      "system.announcements",
      "data.dashboard",
      "data.revenue",
      "data.export",
    ];
    for (const perm of all) {
      expect(hasPermission("admin", perm)).toBe(true);
    }
  });

  it("viewer has only view-level permissions", () => {
    expect(hasPermission("viewer", "orders.view")).toBe(true);
    expect(hasPermission("viewer", "players.view")).toBe(true);
    expect(hasPermission("viewer", "users.view")).toBe(true);
    expect(hasPermission("viewer", "data.dashboard")).toBe(true);
    // viewer should NOT have edit/delete/admin permissions
    expect(hasPermission("viewer", "orders.edit")).toBe(false);
    expect(hasPermission("viewer", "orders.delete")).toBe(false);
    expect(hasPermission("viewer", "finance.view")).toBe(false);
    expect(hasPermission("viewer", "system.settings")).toBe(false);
  });

  it("ops has view + edit permissions but not finance or admin", () => {
    expect(hasPermission("ops", "orders.view")).toBe(true);
    expect(hasPermission("ops", "orders.edit")).toBe(true);
    expect(hasPermission("ops", "orders.export")).toBe(true);
    expect(hasPermission("ops", "orders.dispute_resolve")).toBe(true);
    expect(hasPermission("ops", "players.edit")).toBe(true);
    expect(hasPermission("ops", "users.membership")).toBe(true);
    expect(hasPermission("ops", "system.announcements")).toBe(true);
    expect(hasPermission("ops", "data.export")).toBe(true);
    // ops should NOT have finance or admin permissions
    expect(hasPermission("ops", "finance.view")).toBe(false);
    expect(hasPermission("ops", "orders.delete")).toBe(false);
    expect(hasPermission("ops", "system.settings")).toBe(false);
  });

  it("finance has finance permissions and below", () => {
    expect(hasPermission("finance", "finance.view")).toBe(true);
    expect(hasPermission("finance", "finance.ledger")).toBe(true);
    expect(hasPermission("finance", "finance.invoices")).toBe(true);
    expect(hasPermission("finance", "players.credit")).toBe(true);
    expect(hasPermission("finance", "data.revenue")).toBe(true);
    // finance also has ops and viewer permissions
    expect(hasPermission("finance", "orders.view")).toBe(true);
    expect(hasPermission("finance", "orders.edit")).toBe(true);
    expect(hasPermission("finance", "players.edit")).toBe(true);
    // finance should NOT have admin-only permissions
    expect(hasPermission("finance", "orders.delete")).toBe(false);
    expect(hasPermission("finance", "system.settings")).toBe(false);
    expect(hasPermission("finance", "finance.refund")).toBe(false);
  });

  it("returns false for unknown permission", () => {
    expect(hasPermission("admin", "nonexistent.perm" as Permission)).toBe(false);
  });

  it("orders.delete requires admin", () => {
    expect(hasPermission("admin", "orders.delete")).toBe(true);
    expect(hasPermission("finance", "orders.delete")).toBe(false);
    expect(hasPermission("ops", "orders.delete")).toBe(false);
    expect(hasPermission("viewer", "orders.delete")).toBe(false);
  });
});

describe("getPermissions", () => {
  it("returns correct list for viewer", () => {
    const perms = getPermissions("viewer");
    expect(perms).toContain("orders.view");
    expect(perms).toContain("players.view");
    expect(perms).toContain("users.view");
    expect(perms).toContain("data.dashboard");
    expect(perms).not.toContain("orders.edit");
    expect(perms).not.toContain("finance.view");
  });

  it("returns correct list for admin (all permissions)", () => {
    const perms = getPermissions("admin");
    expect(perms.length).toBe(22);
  });

  it("viewer permissions are a subset of ops permissions", () => {
    const viewerPerms = getPermissions("viewer");
    const opsPerms = getPermissions("ops");
    for (const perm of viewerPerms) {
      expect(opsPerms).toContain(perm);
    }
    expect(opsPerms.length).toBeGreaterThan(viewerPerms.length);
  });

  it("role hierarchy: admin > finance > ops > viewer", () => {
    const viewerCount = getPermissions("viewer").length;
    const opsCount = getPermissions("ops").length;
    const financeCount = getPermissions("finance").length;
    const adminCount = getPermissions("admin").length;
    expect(adminCount).toBeGreaterThan(financeCount);
    expect(financeCount).toBeGreaterThan(opsCount);
    expect(opsCount).toBeGreaterThan(viewerCount);
  });
});

describe("getMinRole", () => {
  it("returns correct minimum role for permissions", () => {
    expect(getMinRole("orders.view")).toBe("viewer");
    expect(getMinRole("orders.edit")).toBe("ops");
    expect(getMinRole("orders.delete")).toBe("admin");
    expect(getMinRole("finance.view")).toBe("finance");
    expect(getMinRole("players.credit")).toBe("finance");
    expect(getMinRole("system.settings")).toBe("admin");
    expect(getMinRole("system.announcements")).toBe("ops");
  });

  it("returns admin for unknown permission", () => {
    expect(getMinRole("unknown.perm" as Permission)).toBe("admin");
  });
});
