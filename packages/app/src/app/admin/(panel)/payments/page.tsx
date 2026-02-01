"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

type PaymentEvent = {
  id: string;
  provider: string;
  event: string;
  orderNo?: string;
  amount?: number;
  status?: string;
  verified: boolean;
  createdAt: number;
};

export default function PaymentsPage() {
  const [events, setEvents] = useState<PaymentEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const load = async (nextPage = page) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/payments?page=${nextPage}`);
      if (res.ok) {
        const data = await res.json();
        setEvents(Array.isArray(data?.items) ? data.items : []);
        setPage(data?.page || nextPage);
        setTotalPages(data?.totalPages || 1);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1);
  }, []);

  return (
    <div className="admin-section">
      <div className="admin-card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h3>支付事件</h3>
            <p>展示支付回调事件与核验状态。</p>
          </div>
          <button className="admin-btn ghost" onClick={() => load(1)}>
            <RefreshCw size={16} style={{ marginRight: 6 }} />
            刷新
          </button>
        </div>
      </div>

      <div className="admin-card">
        {loading ? (
          <p>加载中...</p>
        ) : events.length === 0 ? (
          <p>暂无支付事件</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>事件</th>
                  <th>订单号</th>
                  <th>金额</th>
                  <th>状态</th>
                  <th>校验</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td>{new Date(event.createdAt).toLocaleString()}</td>
                    <td>{event.event}</td>
                    <td>{event.orderNo || "-"}</td>
                    <td>{typeof event.amount === "number" ? event.amount : "-"}</td>
                    <td>{event.status || "-"}</td>
                    <td>{event.verified ? "已校验" : "未校验"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, alignItems: "center" }}>
          <button className="admin-btn ghost" disabled={page <= 1} onClick={() => load(page - 1)}>
            上一页
          </button>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            第 {page} / {totalPages} 页
          </div>
          <button className="admin-btn ghost" disabled={page >= totalPages} onClick={() => load(page + 1)}>
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}
