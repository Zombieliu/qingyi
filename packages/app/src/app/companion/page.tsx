"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Briefcase,
  Calendar,
  DollarSign,
  Star,
  Clock,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { getCurrentAddress } from "@/lib/chain/qy-chain-lite";
import { fetchWithUserAuth } from "@/lib/auth/user-auth-client";
import { StateBlock } from "@/app/components/state-block";
import { formatShortDateTime } from "@/lib/shared/date-utils";
import { t } from "@/lib/i18n/t";

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
  可接单: { label: t("companion.i100"), color: "text-emerald-600" },
  忙碌: { label: t("companion.i101"), color: "text-amber-600" },
  停用: { label: t("companion.i102"), color: "text-gray-400" },
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
  const [scheduleSlots, setScheduleSlots] = useState<{ day: number; start: string; end: string }[]>(
    []
  );
  // Customer tag state
  const [tagTarget, setTagTarget] = useState<{ orderId: string; userAddress: string } | null>(null);
  const [tagForm, setTagForm] = useState({ tag: "difficult", note: "", severity: 1 });
  const [tagSubmitting, setTagSubmitting] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);

  const submitTag = async () => {
    if (!tagTarget) return;
    setTagSubmitting(true);
    try {
      const res = await fetch("/api/companion/customer-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userAddress: tagTarget.userAddress,
          tag: tagForm.tag,
          note: tagForm.note || undefined,
          severity: tagForm.severity,
          reportedBy: address,
        }),
      });
      if (res.ok) {
        setToast("标记已提交");
        setTagTarget(null);
        setTagForm({ tag: "difficult", note: "", severity: 1 });
      } else {
        setToast("提交失败");
      }
    } catch {
      setToast("网络错误");
    } finally {
      setTagSubmitting(false);
      setTimeout(() => setToast(null), 2000);
    }
  };

  const fetchStats = useCallback(async () => {
    if (!address) return;
    try {
      const [statsRes, scheduleRes] = await Promise.all([
        fetchWithUserAuth(`/api/companion/stats?address=${address}`, {}, address),
        fetchWithUserAuth(`/api/companion/schedule?address=${address}`, {}, address),
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (scheduleRes.ok) {
        const data = await scheduleRes.json();
        setScheduleSlots(data.slots || []);
      }
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
    if (!stats?.player || stats.player.status === t("companion.i175")) return;
    const next =
      stats.player.status === t("companion.i176") ? t("companion.i177") : t("companion.i178");
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
        setToast(next === t("companion.i179") ? t("companion.i180") : t("companion.i181"));
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
        <StateBlock tone="warning" title={t("companion.i182")} description={t("companion.i183")} />
      </div>
    );
  }

  const statusInfo =
    STATUS_LABELS[stats?.player?.status || ""] || STATUS_LABELS[t("companion.i184")];
  const isOnline = stats?.player?.status === t("companion.i185");

  return (
    <div className="dl-main">
      <header className="dl-topbar">
        <div className="dl-time">
          <Link href="/me" className="dl-icon-circle" aria-label={t("companion.i186")}>
            <ArrowLeft size={16} />
          </Link>
          <span className="dl-time-text">陪练工作台</span>
        </div>
        <div className="dl-actions">
          {stats?.player && stats.player.status !== t("companion.i187") && (
            <button
              className="dl-icon-circle"
              onClick={toggleStatus}
              disabled={statusToggling}
              aria-label={t("companion.i188")}
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
          <StateBlock tone="loading" size="compact" title={t("companion.i189")} />
        </section>
      ) : !stats?.player ? (
        <section className="dl-card" style={{ padding: 16 }}>
          <StateBlock
            tone="warning"
            title={t("companion.i190")}
            description={t("companion.i191")}
          />
        </section>
      ) : (
        <>
          {/* Profile card */}
          <section className="dl-card" style={{ padding: 16 }}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-bold text-gray-900">{stats.player.name}</div>
                <div className="text-xs text-gray-400">
                  {stats.player.role || t("companion.i192")}
                </div>
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
              <StateBlock tone="loading" size="compact" title={t("companion.i193")} />
            ) : orders.length === 0 ? (
              <StateBlock
                tone="empty"
                size="compact"
                title={orderTab === "active" ? t("companion.i194") : t("companion.i195")}
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
                      <span>用户: {order.user || t("companion.i196")}</span>
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
                    {order.userAddress && (
                      <button
                        className="mt-1.5 text-[10px] text-orange-500 hover:text-orange-700"
                        onClick={() =>
                          setTagTarget({ orderId: order.id, userAddress: order.userAddress! })
                        }
                      >
                        🏷️ 标记老板
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Schedule */}
          <ScheduleSection
            address={address}
            slots={scheduleSlots}
            setSlots={setScheduleSlots}
            show={showSchedule}
            setShow={setShowSchedule}
            setToast={setToast}
          />

          {/* Customer Tag Modal */}
          {tagTarget && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
              onClick={() => setTagTarget(null)}
            >
              <div
                className="bg-white rounded-2xl p-5 w-[90vw] max-w-sm shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="text-sm font-semibold mb-3">🏷️ 标记老板</div>
                <div className="text-[10px] text-gray-400 mb-3">仅陪练和运营可见，老板看不到</div>
                <label className="block text-xs text-gray-600 mb-1">标签类型</label>
                <select
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm mb-2"
                  value={tagForm.tag}
                  onChange={(e) => setTagForm((f) => ({ ...f, tag: e.target.value }))}
                >
                  <option value="difficult">⚠️ 事多/难伺候</option>
                  <option value="slow_pay">⏳ 拖延付款</option>
                  <option value="rude">😤 态度差</option>
                  <option value="no_show">👻 放鸽子/不上线</option>
                  <option value="frequent_dispute">⚖️ 频繁争议</option>
                  <option value="vip_treat">👑 VIP 优待</option>
                  <option value="other">📌 其他</option>
                </select>
                <label className="block text-xs text-gray-600 mb-1">严重程度</label>
                <select
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm mb-2"
                  value={tagForm.severity}
                  onChange={(e) => setTagForm((f) => ({ ...f, severity: Number(e.target.value) }))}
                >
                  <option value={1}>💡 提醒</option>
                  <option value={2}>⚠️ 警告</option>
                  <option value={3}>🚨 高危</option>
                </select>
                <label className="block text-xs text-gray-600 mb-1">备注（选填）</label>
                <input
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm mb-3"
                  placeholder="具体情况说明..."
                  value={tagForm.note}
                  onChange={(e) => setTagForm((f) => ({ ...f, note: e.target.value }))}
                />
                <div className="flex gap-2">
                  <button
                    className="flex-1 rounded-lg bg-gray-100 py-2 text-sm text-gray-600"
                    onClick={() => setTagTarget(null)}
                  >
                    取消
                  </button>
                  <button
                    className="flex-1 rounded-lg bg-orange-500 py-2 text-sm text-white font-medium disabled:opacity-50"
                    onClick={submitTag}
                    disabled={tagSubmitting}
                  >
                    {tagSubmitting ? "提交中..." : "提交标记"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Schedule sub-component ───

const DAY_LABELS = [
  t("companion.i197"),
  t("companion.i198"),
  t("companion.i199"),
  t("companion.i200"),
  t("companion.i201"),
  t("companion.i202"),
  t("companion.i203"),
];

function ScheduleSection({
  address,
  slots,
  setSlots,
  show,
  setShow,
  setToast,
}: {
  address: string;
  slots: { day: number; start: string; end: string }[];
  setSlots: (s: { day: number; start: string; end: string }[]) => void;
  show: boolean;
  setShow: (v: boolean) => void;
  setToast: (v: string | null) => void;
}) {
  const [saving, setSaving] = useState(false);

  const addSlot = (day: number) => {
    setSlots([...slots, { day, start: "09:00", end: "22:00" }]);
  };

  const removeSlot = (idx: number) => {
    setSlots(slots.filter((_, i) => i !== idx));
  };

  const updateSlot = (idx: number, field: "start" | "end", value: string) => {
    setSlots(slots.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetchWithUserAuth(
        "/api/companion/schedule",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address, slots }),
        },
        address
      );
      if (res.ok) {
        setToast("排班已保存");
      } else {
        setToast("保存失败");
      }
    } catch {
      setToast("保存失败");
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 2000);
    }
  };

  return (
    <section className="dl-card" style={{ padding: 16, marginTop: 12, marginBottom: 24 }}>
      <button
        className="flex items-center gap-2 text-sm font-semibold text-gray-900 w-full text-left"
        onClick={() => setShow(!show)}
      >
        <Calendar size={16} className="text-blue-500" />
        排班设置
        <span className="text-xs text-gray-400 ml-auto">
          {slots.length > 0 ? `${slots.length} 个时段` : t("companion.i204")}
        </span>
      </button>

      {show && (
        <div className="mt-3">
          {DAY_LABELS.map((label, day) => {
            const daySlots = slots.map((s, i) => ({ ...s, idx: i })).filter((s) => s.day === day);
            return (
              <div key={day} className="mb-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-700">{label}</span>
                  <button className="text-[10px] text-blue-500" onClick={() => addSlot(day)}>
                    + 添加
                  </button>
                </div>
                {daySlots.map((slot) => (
                  <div key={slot.idx} className="flex items-center gap-2 mt-1">
                    <input
                      type="time"
                      value={slot.start}
                      onChange={(e) => updateSlot(slot.idx, "start", e.target.value)}
                      className="rounded border border-gray-200 px-2 py-1 text-xs"
                    />
                    <span className="text-xs text-gray-400">—</span>
                    <input
                      type="time"
                      value={slot.end}
                      onChange={(e) => updateSlot(slot.idx, "end", e.target.value)}
                      className="rounded border border-gray-200 px-2 py-1 text-xs"
                    />
                    <button
                      className="text-[10px] text-red-400"
                      onClick={() => removeSlot(slot.idx)}
                    >
                      删除
                    </button>
                  </div>
                ))}
                {daySlots.length === 0 && (
                  <div className="text-[10px] text-gray-300 mt-1">休息</div>
                )}
              </div>
            );
          })}
          <button className="lc-tab-btn is-active mt-3 w-full" onClick={save} disabled={saving}>
            {saving ? t("companion.i205") : t("companion.i206")}
          </button>
        </div>
      )}
    </section>
  );
}
