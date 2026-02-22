"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Bell, CheckCheck, Package, Gift, TrendingUp, Info } from "lucide-react";
import { getCurrentAddress } from "@/lib/chain/qy-chain-lite";
import { fetchWithUserAuth } from "@/lib/auth/user-auth-client";
import { StateBlock } from "@/app/components/state-block";
import { formatShortDateTime } from "@/lib/shared/date-utils";
import type { Notification } from "@/app/components/use-notifications";

const TYPE_ICONS: Record<string, typeof Bell> = {
  order_status: Package,
  referral: Gift,
  growth: TrendingUp,
  system: Info,
};

const TYPE_COLORS: Record<string, string> = {
  order_status: "text-blue-500",
  referral: "text-pink-500",
  growth: "text-emerald-500",
  system: "text-gray-500",
};

export default function NotificationsPage() {
  const [address] = useState(() => {
    if (typeof window === "undefined") return "";
    return getCurrentAddress() || "";
  });
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [markingAll, setMarkingAll] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!address) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetchWithUserAuth(
        `/api/notifications?address=${address}&page=${page}&pageSize=30`,
        {},
        address
      );
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.items || []);
        setTotalPages(data.totalPages || 1);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [address, page]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const markRead = async (id: string) => {
    await fetchWithUserAuth(
      "/api/notifications",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, id }),
      },
      address
    ).catch(() => {});
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const markAllRead = async () => {
    setMarkingAll(true);
    await fetchWithUserAuth(
      "/api/notifications",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, all: true }),
      },
      address
    ).catch(() => {});
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setMarkingAll(false);
  };

  const hasUnread = notifications.some((n) => !n.read);

  return (
    <div className="dl-main">
      <header className="dl-topbar">
        <div className="dl-time">
          <Link href="/me" className="dl-icon-circle" aria-label="返回">
            <ArrowLeft size={16} />
          </Link>
          <span className="dl-time-text">消息中心</span>
        </div>
        <div className="dl-actions">
          {hasUnread && (
            <button
              className="dl-icon-circle"
              onClick={markAllRead}
              disabled={markingAll}
              aria-label="全部已读"
            >
              <CheckCheck size={16} />
            </button>
          )}
        </div>
      </header>

      {loading ? (
        <section className="dl-card" style={{ padding: 16 }}>
          <StateBlock tone="loading" size="compact" title="加载中..." />
        </section>
      ) : !address ? (
        <section className="dl-card" style={{ padding: 16 }}>
          <StateBlock tone="warning" title="请先登录" />
        </section>
      ) : notifications.length === 0 ? (
        <section className="dl-card" style={{ padding: 16 }}>
          <StateBlock tone="empty" size="compact" title="暂无消息" description="有新动态会通知你" />
        </section>
      ) : (
        <section style={{ marginBottom: 24 }}>
          <div className="grid gap-2">
            {notifications.map((n) => {
              const Icon = TYPE_ICONS[n.type] || Bell;
              const color = TYPE_COLORS[n.type] || "text-gray-500";
              return (
                <button
                  key={n.id}
                  className={`dl-card text-left w-full ${n.read ? "opacity-60" : ""}`}
                  style={{ padding: 12, cursor: n.read ? "default" : "pointer" }}
                  onClick={() => !n.read && markRead(n.id)}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 ${color}`}>
                      <Icon size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900">{n.title}</span>
                        {!n.read && (
                          <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">{n.body}</div>
                      <div className="text-[10px] text-gray-400 mt-1">
                        {formatShortDateTime(n.createdAt)}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-3">
              <button
                className="lc-tab-btn"
                disabled={page <= 1}
                onClick={() => {
                  setPage((p) => p - 1);
                  setLoading(true);
                }}
              >
                上一页
              </button>
              <span className="text-xs text-gray-400 self-center">
                {page}/{totalPages}
              </span>
              <button
                className="lc-tab-btn"
                disabled={page >= totalPages}
                onClick={() => {
                  setPage((p) => p + 1);
                  setLoading(true);
                }}
              >
                下一页
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
