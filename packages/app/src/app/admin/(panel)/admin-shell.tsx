"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
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
  Crown,
  LogOut,
  Menu,
  Link2,
  FileText,
  CreditCard,
  TrendingUp,
} from "lucide-react";
import { useI18n } from "@/lib/i18n-client";
import AutoTranslate from "@/app/components/auto-translate";
import SwControl from "@/app/components/sw-control";
import { PageTransition, Stagger, StaggerItem } from "@/components/ui/motion";

type AdminRole = "admin" | "ops" | "finance" | "viewer";

type AdminSessionSnapshot = {
  role: AdminRole;
  needsLogin: boolean;
};

const SERVER_SNAPSHOT: AdminSessionSnapshot = { role: "viewer", needsLogin: false };
let sessionSnapshot: AdminSessionSnapshot = { role: "viewer", needsLogin: false };
let sessionLoading: Promise<void> | null = null;
const sessionSubscribers = new Set<() => void>();

function notifySession() {
  sessionSubscribers.forEach((callback) => callback());
}

async function refreshSession() {
  try {
    const res = await fetch("/api/admin/me");
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      sessionSnapshot = {
        role: (data?.role as AdminRole) || sessionSnapshot.role,
        needsLogin: false,
      };
      const expiresAt = Number(data?.expiresAt || 0);
      if (expiresAt && expiresAt - Date.now() < 30 * 60 * 1000) {
        await fetch("/api/admin/refresh", { method: "POST" });
      }
    } else if (res.status === 401) {
      sessionSnapshot = { role: "viewer", needsLogin: true };
    }
  } catch {
    // Ignore transient session errors.
  } finally {
    notifySession();
  }
}

function ensureSession() {
  if (!sessionLoading) {
    sessionLoading = refreshSession().finally(() => {
      sessionLoading = null;
    });
  }
}

function subscribeSession(callback: () => void) {
  sessionSubscribers.add(callback);
  ensureSession();
  return () => sessionSubscribers.delete(callback);
}

type NavItem = { href: string; label: string; icon: ElementType; minRole: AdminRole };

const navItems: NavItem[] = [
  { href: "/admin", label: "运营概览", icon: LayoutGrid, minRole: "viewer" },
  { href: "/admin/orders", label: "订单调度", icon: ClipboardList, minRole: "ops" },
  { href: "/admin/support", label: "客服工单", icon: Headset, minRole: "ops" },
  { href: "/admin/coupons", label: "优惠卡券", icon: TicketPercent, minRole: "ops" },
  { href: "/admin/vip", label: "会员管理", icon: Crown, minRole: "ops" },
  { href: "/admin/players", label: "打手管理", icon: Users, minRole: "ops" },
  { href: "/admin/guardians", label: "护航申请", icon: UserCheck, minRole: "ops" },
  { href: "/admin/announcements", label: "公告资讯", icon: Megaphone, minRole: "ops" },
  { href: "/admin/analytics", label: "增长数据", icon: TrendingUp, minRole: "ops" },
  { href: "/admin/ledger", label: "记账中心", icon: Wallet, minRole: "finance" },
  { href: "/admin/mantou", label: "馒头提现", icon: Wallet, minRole: "finance" },
  { href: "/admin/invoices", label: "发票申请", icon: FileCheck, minRole: "finance" },
  { href: "/admin/chain", label: "订单对账", icon: Link2, minRole: "finance" },
  { href: "/admin/payments", label: "支付事件", icon: CreditCard, minRole: "finance" },
  { href: "/admin/audit", label: "审计日志", icon: FileText, minRole: "admin" },
];

const navSections: Array<{ label: string; items: string[] }> = [
  { label: "概览", items: ["/admin"] },
  {
    label: "运营中心",
    items: [
      "/admin/orders",
      "/admin/support",
      "/admin/coupons",
      "/admin/vip",
      "/admin/players",
      "/admin/guardians",
      "/admin/announcements",
      "/admin/analytics",
    ],
  },
  {
    label: "财务结算",
    items: ["/admin/ledger", "/admin/mantou", "/admin/invoices", "/admin/chain", "/admin/payments"],
  },
  { label: "系统", items: ["/admin/audit"] },
];

const navLookup = new Map(navItems.map((item) => [item.href, item]));

const subtitles: Record<string, string> = {
  "/admin": "关键指标与实时调度情况",
  "/admin/orders": "订单跟踪、分配与状态更新",
  "/admin/support": "客服工单受理与跟进",
  "/admin/coupons": "优惠券配置与发放",
  "/admin/vip": "会员等级、申请与会员管理",
  "/admin/players": "打手档案、状态与接单能力",
  "/admin/guardians": "护航申请审核与入库",
  "/admin/announcements": "公告与资讯统一发布",
  "/admin/analytics": "访问与转化漏斗监控",
  "/admin/ledger": "充值记账与凭证管理",
  "/admin/mantou": "打手馒头提现审核",
  "/admin/invoices": "开票申请与处理",
  "/admin/chain": "订单对账与争议裁决",
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

const roleLabels: Record<AdminRole, string> = {
  admin: "超级管理员",
  finance: "财务",
  ops: "运营",
  viewer: "只读",
};

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const { locale, setLocale, t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const session = useSyncExternalStore(
    subscribeSession,
    () => sessionSnapshot,
    () => SERVER_SNAPSHOT
  );
  const role = session.role;

  const visibleNav = useMemo(
    () => navItems.filter((item) => roleRank(role) >= roleRank(item.minRole)),
    [role]
  );
  const active = useMemo(
    () =>
      visibleNav.find(
        (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
      ) || visibleNav[0] || navItems[0],
    [pathname, visibleNav]
  );

  useEffect(() => {
    if (session.needsLogin) {
      router.push("/admin/login");
    }
  }, [router, session.needsLogin]);

  const handleLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
  };

  return (
    <div className="admin-grid">
      {sidebarOpen ? (
        <button
          aria-label={t("关闭侧边栏")}
          className="admin-scrim"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}
      <aside className="admin-sidebar" data-open={sidebarOpen ? "true" : "false"}>
        <div className="admin-logo">
          <div className="admin-logo-icon">QY</div>
          <div>
            <h1>情谊电竞</h1>
            <p>{t("运营管理中心")}</p>
          </div>
        </div>
        <nav className="admin-nav">
          {navSections.map((section) => {
            const items = section.items
              .map((href) => navLookup.get(href))
              .filter((item): item is NavItem => Boolean(item))
              .filter((item) => roleRank(role) >= roleRank(item.minRole));

            if (items.length === 0) return null;

            return (
              <div key={section.label} className="admin-nav-section">
                <div className="admin-nav-label">{t(section.label)}</div>
                <Stagger>
                  {items.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                    return (
                      <StaggerItem key={item.href}>
                        <Link
                          href={item.href}
                          onClick={() => setSidebarOpen(false)}
                          className={`admin-nav-item${isActive ? " active" : ""}`}
                        >
                          <Icon size={18} />
                          {t(item.label)}
                        </Link>
                      </StaggerItem>
                    );
                  })}
                </Stagger>
              </div>
            );
          })}
        </nav>
        <div className="admin-sidebar-footer">
          <div>
            {t("当前权限：")}
            {t(roleLabels[role] || role)}
          </div>
          <SwControl />
          <button className="admin-btn secondary" onClick={handleLogout}>
            <LogOut size={16} style={{ marginRight: 6 }} />
            {t("退出登录")}
          </button>
        </div>
      </aside>
      <main className="admin-main">
        <div className="admin-topbar">
          <div className="admin-topbar-main">
            <h2 className="admin-title">{active?.label ? t(active.label) : t("管理后台")}</h2>
            <p className="admin-subtitle">
              {subtitles[active?.href || "/admin"] ? t(subtitles[active?.href || "/admin"]) : t("运营状态一览")}
            </p>
          </div>
          <div className="admin-actions">
            <span className="admin-pill">
              {t("当前权限：")}
              {t(roleLabels[role] || role)}
            </span>
            <button
              className="admin-btn ghost"
              onClick={() => {
                const next = locale === "en" ? "zh" : "en";
                setLocale(next);
                window.location.reload();
              }}
            >
              {locale === "en" ? "中文" : "English"}
            </button>
            <button
              className="admin-btn ghost admin-menu-toggle"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={16} style={{ marginRight: 6 }} />
              {t("菜单")}
            </button>
          </div>
        </div>
        <AutoTranslate>
          <PageTransition routeKey={pathname}>{children}</PageTransition>
        </AutoTranslate>
      </main>
    </div>
  );
}
