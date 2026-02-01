"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ElementType } from "react";
import {
  LayoutGrid,
  ClipboardList,
  Users,
  Megaphone,
  Wallet,
  Headset,
  TicketPercent,
  FileCheck,
  UserCheck,
  LogOut,
  Menu,
  Link2,
  FileText,
  CreditCard,
} from "lucide-react";

type AdminRole = "admin" | "ops" | "finance" | "viewer";

const navItems: Array<{ href: string; label: string; icon: ElementType; minRole: AdminRole }> = [
  { href: "/admin", label: "运营概览", icon: LayoutGrid, minRole: "viewer" },
  { href: "/admin/orders", label: "订单调度", icon: ClipboardList, minRole: "ops" },
  { href: "/admin/support", label: "客服工单", icon: Headset, minRole: "ops" },
  { href: "/admin/coupons", label: "优惠卡券", icon: TicketPercent, minRole: "ops" },
  { href: "/admin/players", label: "打手管理", icon: Users, minRole: "ops" },
  { href: "/admin/guardians", label: "护航申请", icon: UserCheck, minRole: "ops" },
  { href: "/admin/announcements", label: "公告资讯", icon: Megaphone, minRole: "ops" },
  { href: "/admin/ledger", label: "链上记账", icon: Wallet, minRole: "finance" },
  { href: "/admin/invoices", label: "发票申请", icon: FileCheck, minRole: "finance" },
  { href: "/admin/chain", label: "链上对账", icon: Link2, minRole: "finance" },
  { href: "/admin/payments", label: "支付事件", icon: CreditCard, minRole: "finance" },
  { href: "/admin/audit", label: "审计日志", icon: FileText, minRole: "admin" },
];

const subtitles: Record<string, string> = {
  "/admin": "关键指标与实时调度情况",
  "/admin/orders": "订单跟踪、分配与状态更新",
  "/admin/support": "客服工单受理与跟进",
  "/admin/coupons": "优惠券配置与发放",
  "/admin/players": "打手档案、状态与接单能力",
  "/admin/guardians": "护航申请审核与入库",
  "/admin/announcements": "公告与资讯统一发布",
  "/admin/ledger": "充值记账与链上凭证",
  "/admin/invoices": "开票申请与处理",
  "/admin/chain": "链上订单对账与争议裁决",
  "/admin/payments": "支付回调记录与核验",
  "/admin/audit": "后台关键操作审计",
};

function roleRank(role: AdminRole) {
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

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [role, setRole] = useState<AdminRole>("viewer");

  const visibleNav = useMemo(
    () => navItems.filter((item) => roleRank(role) >= roleRank(item.minRole)),
    [role]
  );
  const active = useMemo(
    () => visibleNav.find((item) => pathname === item.href) || visibleNav[0] || navItems[0],
    [pathname, visibleNav]
  );

  useEffect(() => {
    const loadRole = async () => {
      const res = await fetch("/api/admin/me");
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data?.role) setRole(data.role as AdminRole);
        const expiresAt = Number(data?.expiresAt || 0);
        if (expiresAt && expiresAt - Date.now() < 30 * 60 * 1000) {
          await fetch("/api/admin/refresh", { method: "POST" });
        }
      } else if (res.status === 401) {
        router.push("/admin/login");
      }
    };
    loadRole();
  }, []);

  const handleLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
  };

  return (
    <div className="admin-grid">
      {sidebarOpen ? (
        <button
          aria-label="关闭侧边栏"
          className="admin-scrim"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}
      <aside className="admin-sidebar" data-open={sidebarOpen ? "true" : "false"}>
        <div className="admin-logo">
          <div className="admin-logo-icon">QY</div>
          <div>
            <h1>情谊电竞</h1>
            <p>运营管理中心</p>
          </div>
        </div>
        <nav className="admin-nav">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`admin-nav-item${isActive ? " active" : ""}`}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="admin-sidebar-footer">
          <div>当前权限：{role}</div>
          <button className="admin-btn secondary" onClick={handleLogout}>
            <LogOut size={16} style={{ marginRight: 6 }} />
            退出登录
          </button>
        </div>
      </aside>
      <main className="admin-main">
        <div className="admin-topbar">
          <div>
            <h2 className="admin-title">{active?.label || "管理后台"}</h2>
            <p className="admin-subtitle">
              {subtitles[active?.href || "/admin"] || "运营状态一览"}
            </p>
          </div>
          <div className="admin-actions">
            <button
              className="admin-btn ghost admin-menu-toggle"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={16} style={{ marginRight: 6 }} />
              菜单
            </button>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
