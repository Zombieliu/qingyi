"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import type { AdminOrder, OrderStage } from "@/lib/admin-types";
import { ORDER_STAGE_OPTIONS } from "@/lib/admin-types";

function formatTime(ts: number) {
  return new Date(ts).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("全部");
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const loadOrders = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/orders");
      if (res.ok) {
        const data = await res.json();
        setOrders(Array.isArray(data) ? data : []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesStage = stageFilter === "全部" || order.stage === stageFilter;
      const keyword = query.trim();
      const matchesQuery =
        !keyword ||
        order.user.includes(keyword) ||
        order.item.includes(keyword) ||
        order.id.includes(keyword);
      return matchesStage && matchesQuery;
    });
  }, [orders, query, stageFilter]);

  const updateOrder = async (orderId: string, patch: Partial<AdminOrder>) => {
    setSaving((prev) => ({ ...prev, [orderId]: true }));
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const data = await res.json();
        setOrders((prev) =>
          prev.map((order) => (order.id === orderId ? data : order))
        );
      }
    } finally {
      setSaving((prev) => ({ ...prev, [orderId]: false }));
    }
  };

  return (
    <div className="admin-section">
      <div className="admin-card">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <div style={{ flex: 1, minWidth: 220, position: "relative" }}>
            <Search
              size={16}
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "#64748b",
              }}
            />
            <input
              className="admin-input"
              style={{ paddingLeft: 36 }}
              placeholder="搜索用户 / 订单号 / 商品"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <select
            className="admin-select"
            style={{ minWidth: 160 }}
            value={stageFilter}
            onChange={(event) => setStageFilter(event.target.value)}
          >
            <option value="全部">全部状态</option>
            {ORDER_STAGE_OPTIONS.map((stage) => (
              <option key={stage} value={stage}>
                {stage}
              </option>
            ))}
          </select>
          <button className="admin-btn ghost" onClick={loadOrders}>
            <RefreshCw size={16} style={{ marginRight: 6 }} />
            刷新
          </button>
        </div>
      </div>

      <div className="admin-card">
        {loading ? (
          <p>加载订单中...</p>
        ) : filteredOrders.length === 0 ? (
          <p>没有符合条件的订单</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>订单信息</th>
                  <th>金额</th>
                  <th>付款状态</th>
                  <th>流程状态</th>
                  <th>派单</th>
                  <th>备注</th>
                  <th>更新</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{order.user}</div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>
                        {order.item}
                      </div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>
                        {order.id}
                      </div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>
                        {formatTime(order.createdAt)}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>
                        {order.currency === "CNY" ? "¥" : order.currency} {order.amount}
                      </div>
                    </td>
                    <td>
                      <input
                        className="admin-input"
                        value={order.paymentStatus || ""}
                        onChange={(event) =>
                          setOrders((prev) =>
                            prev.map((item) =>
                              item.id === order.id
                                ? { ...item, paymentStatus: event.target.value }
                                : item
                            )
                          )
                        }
                        onBlur={(event) =>
                          updateOrder(order.id, { paymentStatus: event.target.value })
                        }
                      />
                    </td>
                    <td>
                      <select
                        className="admin-select"
                        value={order.stage}
                        onChange={(event) => {
                          const nextStage = event.target.value as OrderStage;
                          setOrders((prev) =>
                            prev.map((item) =>
                              item.id === order.id ? { ...item, stage: nextStage } : item
                            )
                          );
                          updateOrder(order.id, { stage: nextStage });
                        }}
                      >
                        {ORDER_STAGE_OPTIONS.map((stage) => (
                          <option key={stage} value={stage}>
                            {stage}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        className="admin-input"
                        placeholder="打手/客服"
                        value={order.assignedTo || ""}
                        onChange={(event) =>
                          setOrders((prev) =>
                            prev.map((item) =>
                              item.id === order.id
                                ? { ...item, assignedTo: event.target.value }
                                : item
                            )
                          )
                        }
                        onBlur={(event) =>
                          updateOrder(order.id, { assignedTo: event.target.value })
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="admin-input"
                        placeholder="备注"
                        value={order.note || ""}
                        onChange={(event) =>
                          setOrders((prev) =>
                            prev.map((item) =>
                              item.id === order.id
                                ? { ...item, note: event.target.value }
                                : item
                            )
                          )
                        }
                        onBlur={(event) =>
                          updateOrder(order.id, { note: event.target.value })
                        }
                      />
                    </td>
                    <td>
                      <span className="admin-badge neutral">
                        {saving[order.id] ? "保存中" : "已同步"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
