"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
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
  KeyRound,
  LogOut,
  Menu,
  Link2,
  FileText,
  CreditCard,
  TrendingUp,
  BarChart3,
  Gift,
} from "lucide-react";
import { t, useI18n } from "@/lib/i18n/i18n-client";
import AutoTranslate from "@/app/components/auto-translate";
import SwControl from "@/app/components/sw-control";
import { PageTransition, Stagger, StaggerItem } from "@/components/ui/motion";
import { StateBlock } from "@/app/components/state-block";
import AdminToast from "./admin-toast";
import { AdminSessionProvider, type AdminRole, roleRank } from "./admin-session";

type AdminSessionSnapshot = {
  role: AdminRole;
  needsLogin: boolean;
  ready: boolean;
};

const SERVER_SNAPSHOT: AdminSessionSnapshot = { role: "viewer", needsLogin: false, ready: false };
let sessionSnapshot: AdminSessionSnapshot = { role: "viewer", needsLogin: false, ready: false };
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
        ready: true,
      };
      const expiresAt = Number(data?.expiresAt || 0);
      if (expiresAt && expiresAt - Date.now() < 30 * 60 * 1000) {
        await fetch("/api/admin/refresh", { method: "POST" });
      }
    } else if (res.status === 401) {
      sessionSnapshot = { role: "viewer", needsLogin: true, ready: true };
    }
  } catch {
    // Ignore transient session errors.
  } finally {
    if (!sessionSnapshot.ready) {
      sessionSnapshot = { ...sessionSnapshot, ready: true };
    }
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

function shouldNotifyAdminError(res: Response, url: string) {
  if (res.ok) return false;
  if (res.status === 401 || res.status === 403) return false;
  if (!url.includes("/api/")) return false;
  return true;
}

type NavItem = { href: string; label: string; icon: ElementType; minRole: AdminRole };

const navItems: NavItem[] = [
  { href: "/admin", label: t("ui.admin-shell.693"), icon: LayoutGrid, minRole: "viewer" },
  { href: "/admin/orders", label: t("ui.admin-shell.666"), icon: ClipboardList, minRole: "viewer" },
  { href: "/admin/support", label: t("ui.admin-shell.572"), icon: Headset, minRole: "ops" },
  { href: "/admin/coupons", label: "优惠卡券", icon: TicketPercent, minRole: "ops" },
  { href: "/admin/redeem", label: "卡密兑换", icon: KeyRound, minRole: "ops" },
  { href: "/admin/vip", label: t("ui.admin-shell.519"), icon: Crown, minRole: "ops" },
  { href: "/admin/players", label: t("ui.admin-shell.700"), icon: Users, minRole: "viewer" },
  { href: "/admin/guardians", label: t("ui.admin-shell.698"), icon: UserCheck, minRole: "ops" },
  {
    href: "/admin/announcements",
    label: t("ui.admin-shell.540"),
    icon: Megaphone,
    minRole: "viewer",
  },
  { href: "/admin/referral", label: "邀请返利", icon: Gift, minRole: "ops" },
  { href: "/admin/analytics", label: t("ui.admin-shell.567"), icon: TrendingUp, minRole: "admin" },
  { href: "/admin/revenue", label: "营收绩效", icon: BarChart3, minRole: "admin" },
  { href: "/admin/earnings", label: "完单收益", icon: BarChart3, minRole: "finance" },
  { href: "/admin/ledger", label: t("ui.admin-shell.670"), icon: Wallet, minRole: "finance" },
  { href: "/admin/mantou", label: "馒头提现", icon: Wallet, minRole: "finance" },
  { href: "/admin/invoices", label: "发票申请", icon: FileCheck, minRole: "finance" },
  { href: "/admin/chain", label: "订单对账", icon: Link2, minRole: "finance" },
  { href: "/admin/payments", label: "支付事件", icon: CreditCard, minRole: "finance" },
  { href: "/admin/audit", label: "审计日志", icon: FileText, minRole: "admin" },
  { href: "/admin/tokens", label: "密钥管理", icon: KeyRound, minRole: "admin" },
];

const navSections: Array<{ label: string; items: string[] }> = [
  { label: t("ui.admin-shell.633"), items: ["/admin"] },
  {
    label: t("ui.admin-shell.692"),
    items: [
      "/admin/orders",
      "/admin/support",
      "/admin/coupons",
      "/admin/redeem",
      "/admin/vip",
      "/admin/players",
      "/admin/guardians",
      "/admin/announcements",
      "/admin/referral",
      "/admin/analytics",
      "/admin/revenue",
    ],
  },
  {
    label: t("ui.admin-shell.684"),
    items: [
      "/admin/earnings",
      "/admin/ledger",
      "/admin/mantou",
      "/admin/invoices",
      "/admin/chain",
      "/admin/payments",
    ],
  },
  { label: t("ui.admin-shell.642"), items: ["/admin/tokens", "/admin/audit"] },
];

const navLookup = new Map(navItems.map((item) => [item.href, item]));

const subtitles: Record<string, string> = {
  "/admin": t("ui.admin-shell.541"),
  "/admin/orders": t("ui.admin-shell.667"),
  "/admin/support": t("ui.admin-shell.573"),
  "/admin/coupons": t("ui.admin-shell.516"),
  "/admin/vip": t("ui.admin-shell.518"),
  "/admin/players": t("ui.admin-shell.697"),
  "/admin/guardians": t("ui.admin-shell.699"),
  "/admin/announcements": t("ui.admin-shell.539"),
  "/admin/referral": "邀请返利配置与记录管理",
  "/admin/redeem": "卡密生成与兑换记录",
  "/admin/analytics": t("ui.admin-shell.673"),
  "/admin/revenue": "营收趋势、商品分析与陪练绩效",
  "/admin/earnings": "陪练完单与平台撮合费汇总",
  "/admin/ledger": t("ui.admin-shell.535"),
  "/admin/mantou": t("ui.admin-shell.702"),
  "/admin/invoices": t("ui.admin-shell.593"),
  "/admin/chain": t("ui.admin-shell.653"),
  "/admin/payments": t("ui.admin-shell.616"),
  "/admin/audit": t("ui.admin-shell.564"),
  "/admin/tokens": "后台密钥创建与权限控制",
};

const roleLabels: Record<AdminRole, string> = {
  admin: t("ui.admin-shell.688"),
  finance: t("ui.admin-shell.683"),
  ops: t("ui.admin-shell.691"),
  viewer: t("ui.admin-shell.563"),
};

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const { locale, setLocale, t } = useI18n();
  const pathname = usePathname();
  const [routePath, setRoutePath] = useState(
    () => pathname || (typeof window !== "undefined" ? window.location.pathname : "/admin")
  );
  const routePathRef = useRef(routePath);
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
  const requiredItem = useMemo(() => {
    if (!routePath) return null;
    const matches = navItems.filter(
      (item) => routePath === item.href || routePath.startsWith(`${item.href}/`)
    );
    if (matches.length === 0) return null;
    return matches.sort((a, b) => b.href.length - a.href.length)[0];
  }, [routePath]);
  const requiredRole = requiredItem?.minRole;
  const hasAccess = !requiredRole || roleRank(role) >= roleRank(requiredRole);
  const fallbackHref = visibleNav[0]?.href || "/admin";
  const active = useMemo(
    () =>
      visibleNav.find((item) => routePath === item.href || routePath.startsWith(`${item.href}/`)) ||
      visibleNav[0] ||
      navItems[0],
    [routePath, visibleNav]
  );

  useEffect(() => {
    if (session.needsLogin) {
      router.push("/admin/login");
    }
  }, [router, session.needsLogin]);

  useEffect(() => {
    routePathRef.current = routePath;
  }, [routePath]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const tick = () => {
      const nextPath = window.location.pathname || "";
      if (nextPath && nextPath !== routePathRef.current) {
        setRoutePath(nextPath);
      }
    };
    const interval = window.setInterval(tick, 200);
    return () => window.clearInterval(interval);
  }, []);

  // routePath is derived from client history to avoid stale labels on App Router transitions.

  useEffect(() => {
    if (!session.ready || session.needsLogin) return;
    if (requiredRole && !hasAccess && routePath !== fallbackHref) {
      router.replace(fallbackHref);
    }
  }, [fallbackHref, hasAccess, routePath, requiredRole, router, session.needsLogin, session.ready]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [sidebarOpen]);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      try {
        const res = await originalFetch(...args);
        try {
          const input = args[0];
          const url = typeof input === "string" ? input : input instanceof Request ? input.url : "";
          if (shouldNotifyAdminError(res, url)) {
            const traceId = res.headers.get("x-trace-id");
            window.dispatchEvent(
              new CustomEvent("admin:toast", {
                detail: { message: `请求失败（${res.status}）`, traceId },
              })
            );
          }
        } catch {
          // ignore toast errors
        }
        return res;
      } catch (error) {
        window.dispatchEvent(
          new CustomEvent("admin:toast", {
            detail: { message: "网络错误，请稍后重试" },
          })
        );
        throw error;
      }
    };
    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  const handleLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
  };

  return (
    <div className="admin-grid">
      <AdminToast />
      {sidebarOpen ? (
        <button
          aria-label={t("nav.close_sidebar")}
          className="admin-scrim"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}
      <aside className="admin-sidebar" data-open={sidebarOpen ? "true" : "false"}>
        <div className="admin-logo">
          <div className="admin-logo-icon">QY</div>
          <div>
            <h1>{t("ui.admin-shell.177")}</h1>
            <p>{t("nav.ops_center")}</p>
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
                    const isActive =
                      routePath === item.href || routePath.startsWith(`${item.href}/`);
                    return (
                      <StaggerItem key={item.href}>
                        <Link
                          href={item.href}
                          onClick={() => setSidebarOpen(false)}
                          aria-current={isActive ? "page" : undefined}
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
            {t("nav.current_role")}
            {t(roleLabels[role] || role)}
          </div>
          <SwControl />
          <button className="admin-btn secondary" onClick={handleLogout}>
            <LogOut size={16} style={{ marginRight: 6 }} />
            {t("nav.logout")}
          </button>
        </div>
      </aside>
      <main className="admin-main" data-route={routePath}>
        <div className="admin-topbar">
          <div className="admin-topbar-main">
            <h2 className="admin-title">{active?.label ? t(active.label) : t("nav.admin")}</h2>
            <p className="admin-subtitle">
              {subtitles[active?.href || "/admin"]
                ? t(subtitles[active?.href || "/admin"])
                : t("nav.ops_overview")}
            </p>
          </div>
          <div className="admin-actions">
            <span className="admin-pill">
              {t("nav.current_role")}
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
              {locale === "en" ? t("ui.admin-shell.512") : "English"}
            </button>
            <button
              className="admin-btn ghost admin-menu-toggle"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={16} style={{ marginRight: 6 }} />
              {t("nav.menu")}
            </button>
          </div>
        </div>
        <AdminSessionProvider value={{ role, ready: session.ready }}>
          <AutoTranslate>
            {!session.ready ? (
              <div className="admin-section">
                <StateBlock tone="loading" size="compact" title={t("admin.admin_shell.001")} />
              </div>
            ) : requiredRole && !hasAccess ? (
              <div className="admin-section">
                <StateBlock
                  tone="warning"
                  size="compact"
                  title={t("admin.admin_shell.002")}
                  description={t("admin.admin_shell.003")}
                  actions={
                    <Link className="admin-btn ghost" href={fallbackHref}>
                      返回可用页面
                    </Link>
                  }
                />
              </div>
            ) : (
              <PageTransition routeKey={routePath}>{children}</PageTransition>
            )}
          </AutoTranslate>
        </AdminSessionProvider>
      </main>
    </div>
  );
}
