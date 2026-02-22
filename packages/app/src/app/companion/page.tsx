"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Briefcase,
  DollarSign,
  Star,
  Clock,
  CheckCircle,
  XCircle,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { getCurrentAddress } from "@/lib/chain/qy-chain-lite";
import { fetchWithUserAuth } from "@/lib/auth/user-auth-client";
import { StateBlock } from "@/app/components/state-block";
import { formatShortDateTime } from "@/lib/shared/date-utils";

type CompanionStats = {
  player: { id: string; name: string; status: string; role?: string } | null;
  today: { orders: number; revenue: number };
  month: { orders: number; revenue: number; serviceFee: number };
  total: { orders: number; revenue: number; serviceFee: number };
  activeOrders: number;
  rating: { avg: number | null; count: number };
};

type CompanionOrder = {
  id: string;
  user: string;
  userAddress?: string;
  item: string;
  amount: number;
  stage: string;
  serviceFee?: number;
  createdAt: number;
  updatedAt: number | null;
  note?: string;
};

const STAGE_COLORS: Record<string, string> = {
  已支付: "bg-blue-50 text-blue-600",
  进行中: "bg-amber-50 text-amber-600",
  待结算: "bg-purple-50 text-purple-600",
  已完成: "bg-emerald-50 text-emerald-600",
  已取消: "bg-gray-100 text-gray-500",
  已退款: "bg-red-50 text-red-500",
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  可接单: { label: "可接单", color: "text-emerald-600" },
  忙碌: { label: "忙碌中", color: "text-amber-600" },
  停用: { label: "已停用", color: "text-gray-400" },
};

export default function CompanionPage() {
  const [address] = useState(() => {
    if (typeof window === "undefined") return "";
    return getCurrentAddress() || "";
  });
  const [stats, setStats] = useState<CompanionStats | null>(null);
  const [orders, setOrders] = useState<CompanionOrder[]>([]);
  const [orderTab, setOrderTab] = useState<"active" | "completed">("active");
  const [loading, setLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [statusToggling, setStatusToggling] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    if (!address) return;
    try {
      const res = await fetchWithUserAuth(`/api/companion/stats?address=${address}`, {}, address);
      if (res.ok) setStats(await res.json());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [address]);

  const fetchOrders = useCallback(async () => {
    if (!address) return;
    setOrdersLoading(true);
    try {
      const res = await fetchWithUserAuth(
        `/api/companion/orders?address=${address}&status=${orderTab}&pageSize=30`,
        {},
        address
      );
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders || []);
      }
    } catch {
      // ignore
    } finally {
      setOrdersLoading(false);
    }
  }, [address, orderTab]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);
  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const toggleStatus = async () => {
    if (!stats?.player || stats.player.status === "停用") return;
    const next = stats.player.status === "可接单" ? "忙碌" : "可接单";
    setStatusToggling(true);
    try {
      const res = await fetchWithUserAuth(
        "/api/players/me/status",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address, status: next }),
        },
        address
      );
      if (res.ok) {
        setStats((prev) =>
          prev && prev.player ? { ...prev, player: { ...prev.player, status: next } } : prev
        );
        setToast(next === "可接单" ? "已开启接单" : "已切换为忙碌");
      } else {
        setToast("切换失败");
      }
    } catch {
      setToast("切换失败");
    } finally {
      setStatusToggling(false);
      setTimeout(() => setToast(null), 2000);
    }
  };

  if (!address) {
    return (
      <div className="dl-main" style={{ padding: 16 }}>
        <StateBlock tone="warning" title="请先登录" description="登录后查看陪练工作台" />
      </div>
    );
  }

  const statusInfo = STATUS_LABELS[stats?.player?.status || ""] || STATUS_LABELS["停用"];
  const isOnline = stats?.player?.status === "可接单";

  return (
    <div className="dl-main">
      <header className="dl-topbar">
        <div className="dl-time">
          <Link href="/me" className="dl-icon-circle" aria-label="返回">
            <ArrowLeft size={16} />
          </Link>
          <span className="dl-time-text">陪练工作台</span>
        </div>
        <div className="dl-actions">
          {stats?.player && stats.player.status !== "停用" && (
            <button
              className="dl-icon-circle"
              onClick={toggleStatus}
              disabled={statusToggling}
              aria-label="切换接单状态"
            >
              {isOnline ? (
                <ToggleRight size={18} className="text-emerald-500" />
              ) : (
                <ToggleLeft size={18} className="text-gray-400" />
              )}
            </button>
          )}
        </div>
      </header>

      {toast && <div className="ride-toast">{toast}</div>}

      {loading ? (
        <section className="dl-card" style={{ padding: 16 }}>
          <StateBlock tone="loading" size="compact" title="加载中..." />
        </section>
      ) : !stats?.player ? (
        <section className="dl-card" style={{ padding: 16 }}>
          <StateBlock tone="warning" title="非陪练账号" description="当前地址未注册为陪练" />
        </section>
      ) : (
        <>
          {/* Profile card */}
          <section className="dl-card" style={{ padding: 16 }}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-bold text-gray-900">{stats.player.name}</div>
                <div className="text-xs text-gray-400">{stats.player.role || "陪练"}</div>
              </div>
              <div className={`text-sm font-semibold ${statusInfo.color}`}>{statusInfo.label}</div>
            </div>
            {stats.rating.avg !== null && (
              <div className="mt-2 flex items-center gap-1 text-xs text-amber-500">
                <Star size={12} fill="currentColor" />
                {stats.rating.avg} 分 · {stats.rating.count} 条评价
              </div>
            )}
          </section>

          {/* Stats cards */}
          <div className="grid grid-cols-2 gap-3" style={{ marginTop: 12 }}>
            <div className="dl-card" style={{ padding: 12 }}>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Clock size={12} /> 今日
              </div>
              <div className="mt-1 text-xl font-bold text-gray-900">{stats.today.orders} 单</div>
              <div className="text-xs text-gray-400">¥{stats.today.revenue}</div>
            </div>
            <div className="dl-card" style={{ padding: 12 }}>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Briefcase size={12} /> 进行中
              </div>
              <div className="mt-1 text-xl font-bold text-blue-600">{stats.activeOrders} 单</div>
              <div className="text-xs text-gray-400">待处理</div>
            </div>
            <div className="dl-card" style={{ padding: 12 }}>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <DollarSign size={12} /> 本月收入
              </div>
              <div className="mt-1 text-xl font-bold text-emerald-600">¥{stats.month.revenue}</div>
              <div className="text-xs text-gray-400">
                {stats.month.orders} 单 · 服务费 ¥{stats.month.serviceFee}
              </div>
            </div>
            <div className="dl-card" style={{ padding: 12 }}>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <DollarSign size={12} /> 累计收入
              </div>
              <div className="mt-1 text-xl font-bold text-gray-900">¥{stats.total.revenue}</div>
              <div className="text-xs text-gray-400">{stats.total.orders} 单</div>
            </div>
          </div>

          {/* Orders */}
          <section className="dl-card" style={{ padding: 16, marginTop: 12, marginBottom: 24 }}>
            <div className="flex items-center gap-3 mb-3">
              <button
                className={`lc-tab-btn ${orderTab === "active" ? "is-active" : ""}`}
                onClick={() => setOrderTab("active")}
              >
                进行中
              </button>
              <button
                className={`lc-tab-btn ${orderTab === "completed" ? "is-active" : ""}`}
                onClick={() => setOrderTab("completed")}
              >
                已完成
              </button>
            </div>

            {ordersLoading ? (
              <StateBlock tone="loading" size="compact" title="加载订单..." />
            ) : orders.length === 0 ? (
              <StateBlock
                tone="empty"
                size="compact"
                title={orderTab === "active" ? "暂无进行中订单" : "暂无历史订单"}
              />
            ) : (
              <div className="grid gap-2">
                {orders.map((order) => (
                  <div key={order.id} className="rounded-xl border border-slate-100 p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium text-gray-900">{order.item}</div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STAGE_COLORS[order.stage] || "bg-gray-100 text-gray-500"}`}
                      >
                        {order.stage}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
                      <span>用户: {order.user || "匿名"}</span>
                      <span className="font-semibold text-gray-900">¥{order.amount}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[10px] text-gray-400">
                      <span>{formatShortDateTime(order.createdAt)}</span>
                      {order.serviceFee ? <span>服务费 ¥{order.serviceFee}</span> : null}
                    </div>
                    {order.note && (
                      <div className="mt-1 text-[10px] text-gray-400 truncate">
                        备注: {order.note}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
