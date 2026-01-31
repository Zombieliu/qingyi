"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  LayoutGrid,
  ClipboardList,
  Users,
  Megaphone,
  Wallet,
  LogOut,
  Menu,
} from "lucide-react";

const navItems = [
  { href: "/admin", label: "运营概览", icon: LayoutGrid },
  { href: "/admin/orders", label: "订单调度", icon: ClipboardList },
  { href: "/admin/players", label: "打手管理", icon: Users },
  { href: "/admin/announcements", label: "公告资讯", icon: Megaphone },
  { href: "/admin/ledger", label: "链上记账", icon: Wallet },
];

const subtitles: Record<string, string> = {
  "/admin": "关键指标与实时调度情况",
  "/admin/orders": "订单跟踪、分配与状态更新",
  "/admin/players": "打手档案、状态与接单能力",
  "/admin/announcements": "公告与资讯统一发布",
  "/admin/ledger": "充值记账与链上凭证",
};

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const active = useMemo(
    () => navItems.find((item) => pathname === item.href) || navItems[0],
    [pathname]
  );

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
          {navItems.map((item) => {
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
          <div>当前权限：管理员</div>
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
