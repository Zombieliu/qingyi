"use client";
import { useEffect, useState } from "react";
import { Clock3, ArrowLeft } from "lucide-react";
import { loadOrders, type LocalOrder } from "@/app/components/order-store";

export default function Schedule() {
  const [orders, setOrders] = useState<LocalOrder[]>(() => loadOrders());

  const refresh = () => setOrders(loadOrders());

  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener("orders-updated", handler);
    return () => window.removeEventListener("orders-updated", handler);
  }, []);

  return (
    <div className="dl-shell">
      <header className="dl-topbar">
        <div className="dl-time flex items-center gap-2">
          <ArrowLeft size={16} />
          <span className="dl-time-text">安排</span>
        </div>
        <div className="dl-actions">
          <span className="dl-icon-circle">
            <Clock3 size={16} />
          </span>
        </div>
      </header>

      {orders.length === 0 ? (
        <div className="dl-card text-sm text-slate-500">暂无下单记录，前往首页“自助下单”试试。</div>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <div key={o.id} className="dl-card" style={{ padding: 14 }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-gray-900">{o.item}</div>
                  <div className="text-xs text-gray-500 mt-1">{o.user}</div>
                </div>
                <div className="text-sm font-bold text-amber-600">¥{o.amount}</div>
              </div>
              <div className="mt-2 text-xs text-gray-500 flex items-center gap-2">
                <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">{o.status}</span>
                <span>{new Date(o.time).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
