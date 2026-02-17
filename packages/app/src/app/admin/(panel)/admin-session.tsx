"use client";

import { createContext, useContext } from "react";
import type { ReactNode } from "react";

export type AdminRole = "admin" | "ops" | "finance" | "viewer";

export type AdminSessionState = {
  role: AdminRole;
  ready: boolean;
};

const AdminSessionContext = createContext<AdminSessionState>({ role: "viewer", ready: false });

export function AdminSessionProvider({
  value,
  children,
}: {
  value: AdminSessionState;
  children: ReactNode;
}) {
  return <AdminSessionContext.Provider value={value}>{children}</AdminSessionContext.Provider>;
}

export function useAdminSession() {
  return useContext(AdminSessionContext);
}

export function roleRank(role: AdminRole) {
  switch (role) {
    case "admin":
      return 4;
    case "finance":
      return 3;
    case "ops":
      return 2;
    default:
      return 1;
  }
}

export function canAccess(role: AdminRole, required: AdminRole) {
  return roleRank(role) >= roleRank(required);
}
