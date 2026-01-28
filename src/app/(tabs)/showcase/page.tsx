"use client";
import { useEffect, useState } from "react";
import { loadOrders, updateOrder, removeOrder, type LocalOrder } from "@/app/components/order-store";
import { Activity, Clock3, Car, MapPin } from "lucide-react";

export default function Showcase() {
  const [orders, setOrders] = useState<LocalOrder[]>(() => loadOrders());

  useEffect(() => {
    const handler = () => setOrders(loadOrders());
    window.addEventListener("orders-updated", handler);
    return () => window.removeEventListener("orders-updated", handler);
  }, []);

  const accept = (id: string) => {
    updateOrder(id, {
      status: "待用户支付打手费",
      depositPaid: true,
      playerPaid: false,
      driver: {
        name: "护航·刘师傅",
        car: "白色新能源汽车",
        eta: "2.7公里 · 5分钟",
        plate: "苏RF M9358",
        phone: "138****0000",
        price: 63,
      },
    });
  };

  const cancel = (id: string) => {
    updateOrder(id, {
      status: "取消",
      driver: undefined,
      time: new Date().toISOString(),
    });
    removeOrder(id);
  };

  const complete = (id: string) => {
    updateOrder(id, {
      status: "已完成",
      time: new Date().toISOString(),
    });
    removeOrder(id);
  };

  const clearAll = () => {
    if (typeof window === "undefined") return;
    localStorage.removeItem("dl_orders");
    window.dispatchEvent(new Event("orders-updated"));
    setOrders([]);
  };

  return (
    <div className="dl-shell">
      <header className="dl-topbar">
        <div className="dl-time">
          <span className="dl-time-text">接单大厅</span>
          <span className="dl-chip">客户端缓存</span>
        </div>
        <div className="dl-actions">
          <span className="dl-icon-circle">
            <Activity size={16} />
          </span>
          <button className="dl-icon-circle" onClick={clearAll} aria-label="清空订单">
            <span style={{ fontSize: 12 }}>清</span>
          </button>
        </div>
      </header>

      {orders.length === 0 ? (
        <div className="dl-card text-sm text-slate-500">暂无呼叫记录，去首页/安排页选择服务吧。</div>
      ) : (
        <div className="space-y-3">
          {orders.map((o, idx) =>
            o.driver ? (
              <div key={`${o.id}-${idx}`} className="dl-card" style={{ padding: 14, borderColor: "#fed7aa", background: "#fff7ed" }}>
                <div className="flex items-center gap-2 text-amber-600 text-sm font-semibold">
                  <Car size={16} />
                  司机正在赶来
                </div>
                <div className="mt-2 flex items-center gap-6 text-sm text-gray-900">
                  <div>
                    <div className="font-bold">{o.driver.name}</div>
                    <div className="text-xs text-gray-500">{o.driver.car}</div>
                  </div>
                  <div className="text-right text-sm">
                    <div className="font-semibold text-emerald-600">{o.driver.eta}</div>
                    {o.driver.price && <div className="text-xs text-gray-500">一口价 ¥{o.driver.price / 10}</div>}
                  </div>
                </div>
                <div className="mt-2 text-xs text-gray-500 flex items-center gap-2">
                  <MapPin size={14} />
                  取货用车
                </div>
                <div className="mt-2 text-xs">
                  <span className="text-emerald-600 font-semibold mr-2">押金已付</span>
                  {o.playerPaid ? (
                    <span className="text-emerald-700 font-semibold">打手费已付，进行中</span>
                  ) : (
                    <span className="text-red-500 font-semibold">等待用户支付打手费</span>
                  )}
                </div>
                <div className="mt-3 flex items-center gap-10 text-sm">
                  <div>
                    <div className="text-gray-900">{o.item}</div>
                    <div className="text-xs text-gray-500">订单号：{o.id}</div>
                  </div>
                  <div className="text-xs text-gray-500">{new Date(o.time).toLocaleString()}</div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button className="dl-tab-btn" style={{ padding: "8px 10px" }} onClick={() => cancel(o.id)}>
                    取消用车
                  </button>
                  <button className="dl-tab-btn" style={{ padding: "8px 10px" }} onClick={() => complete(o.id)}>
                    完成
                  </button>
                  <button className="dl-tab-btn" style={{ padding: "8px 10px", background: "#f97316", color: "#fff" }}>
                    联系司机
                  </button>
                </div>
              </div>
            ) : (
              <div key={`${o.id}-${idx}`} className="dl-card" style={{ padding: 14 }}>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-gray-900">{o.item}</div>
                  <div className="text-sm font-bold text-amber-600">¥{o.amount}</div>
                </div>
                <div className="mt-2 text-xs text-gray-500 flex items-center gap-2">
                  <Clock3 size={14} />
                  <span>{new Date(o.time).toLocaleString()}</span>
                  <span className="text-amber-600 font-semibold">等待支付押金后接单</span>
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  状态：{o.status} · 撮合费{typeof o.serviceFee === "number" ? ` ¥${o.serviceFee.toFixed(2)}` : "已付"}
                </div>
                <div className="mt-2 text-xs text-orange-600">需先付押金再接单</div>
                <div className="mt-3 flex gap-2">
                  <button className="dl-tab-btn" style={{ padding: "8px 10px" }} onClick={() => accept(o.id)}>
                    付押金并接单
                  </button>
                  <button className="dl-tab-btn" style={{ padding: "8px 10px" }} onClick={() => cancel(o.id)}>
                    取消
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      )}
      <div className="text-xs text-gray-500 mt-6">
        先展示本地记录；后续可接服务端/链上订单并更新 driver 信息以展示到车态。
      </div>
    </div>
  );
}
