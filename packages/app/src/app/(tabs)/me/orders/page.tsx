"use client";
import { t } from "@/lib/i18n/i18n-client";

import Link from "next/link";
import { ArrowLeft, RefreshCw, CalendarCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchOrders } from "@/lib/services/order-service";
import type { LocalOrder } from "@/lib/services/order-store";
import { StateBlock } from "@/app/components/state-block";
import { formatShortDateTime } from "@/lib/shared/date-utils";

const filters = [
  { key: "all", label: "全部订单" },
  { key: "pending-start", label: "待开始" },
  { key: "pending-confirm", label: "待确认" },
];

function formatTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return formatShortDateTime(date);
}

function isPendingStart(order: LocalOrder) {
  const status = order.status || "";
  return ["待派单", "待开始", "待处理", "已确认", "待确认"].some((flag) => status.includes(flag));
}

function isPendingConfirm(order: LocalOrder) {
  const status = order.status || "";
  return ["待确认", "待支付", "已支付"].some((flag) => status.includes(flag));
}

export default function OrderCenterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [orders, setOrders] = useState<LocalOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const filterKey = searchParams?.get("filter") || "all";

  const filtered = useMemo(() => {
    if (filterKey === "pending-start") return orders.filter(isPendingStart);
    if (filterKey === "pending-confirm") return orders.filter(isPendingConfirm);
    return orders;
  }, [orders, filterKey]);

  const load = async () => {
    setLoading(true);
    try {
      const list = await fetchOrders();
      setOrders(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="dl-main">
      <header className="dl-topbar">
        <div className="dl-time">
          <Link href="/me" className="dl-icon-circle" aria-label={t("me.orders.001")}>
            <ArrowLeft size={16} />
          </Link>
          <span className="dl-time-text">订单中心</span>
          <span className="dl-chip">服务记录</span>
        </div>
        <div className="dl-actions">
          <button onClick={load} className="dl-icon-circle" aria-label={t("me.orders.002")}>
            <RefreshCw size={16} />
          </button>
        </div>
      </header>

      <section className="dl-card" style={{ padding: 12 }}>
        <div className="flex gap-2 flex-wrap">
          {filters.map((item) => (
            <button
              key={item.key}
              onClick={() => router.push(`/me/orders?filter=${item.key}`)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                filterKey === item.key
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section className="dl-card" style={{ padding: 16 }}>
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-900">订单列表</div>
          <span className="text-xs text-slate-500">共 {filtered.length} 单</span>
        </div>
        {loading ? (
          <div className="mt-3">
            <StateBlock
              tone="loading"
              size="compact"
              title={t("me.orders.003")}
              description={t("me.orders.004")}
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-4">
            <StateBlock
              tone="empty"
              title={t("me.orders.005")}
              description={t("me.orders.006")}
              actions={
                <Link href="/schedule" className="dl-tab-btn">
                  <CalendarCheck size={14} />
                  去安排
                </Link>
              }
            />
          </div>
        ) : (
          <div className="mt-3 grid gap-3">
            {filtered.map((order) => (
              <Link
                key={order.id}
                href={`/me/orders/${order.id}`}
                className="block rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-[0_10px_30px_rgba(15,23,42,0.06)] transition-colors hover:border-slate-200"
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-gray-900">{order.item}</div>
                  <span className="text-xs text-emerald-600">{order.status}</span>
                </div>
                <div className="text-xs text-slate-500 mt-1">订单号：{order.id}</div>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                  <span>{formatTime(order.time)}</span>
                  <span className="font-semibold text-slate-900">¥{order.amount}</span>
                </div>
                {order.driver ? (
                  <div className="mt-2 text-xs text-slate-500">
                    陪练：{order.driver.name}
                    {order.driver.tier ? ` · ${order.driver.tier}` : ""}
                  </div>
                ) : null}
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
