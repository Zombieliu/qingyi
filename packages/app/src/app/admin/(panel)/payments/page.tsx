"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { readCache, writeCache } from "@/app/components/client-cache";

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
  const cacheTtlMs = 60_000;

  const load = useCallback(async (nextPage: number) => {
    setLoading(true);
    try {
      const cacheKey = `cache:admin:payments:page:${nextPage}`;
      const cached = readCache<{ items: PaymentEvent[]; page?: number; totalPages?: number }>(cacheKey, cacheTtlMs, true);
      if (cached) {
        setEvents(Array.isArray(cached.value?.items) ? cached.value.items : []);
        setPage(cached.value?.page || nextPage);
        setTotalPages(cached.value?.totalPages || 1);
      }
      const res = await fetch(`/api/admin/payments?page=${nextPage}`);
      if (res.ok) {
        const data = await res.json();
        const next = Array.isArray(data?.items) ? data.items : [];
        setEvents(next);
        setPage(data?.page || nextPage);
        setTotalPages(data?.totalPages || 1);
        writeCache(cacheKey, { items: next, page: data?.page || nextPage, totalPages: data?.totalPages || 1 });
      }
    } finally {
      setLoading(false);
    }
  }, [cacheTtlMs]);

  useEffect(() => {
    load(1);
  }, [load]);

  return (
    <div className="admin-section">
      <div className="admin-card">
        <div className="admin-toolbar" style={{ justifyContent: "space-between" }}>
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
          <div className="admin-table-wrap">
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
                    <td data-label="时间">{new Date(event.createdAt).toLocaleString()}</td>
                    <td data-label="事件">{event.event}</td>
                    <td data-label="订单号">{event.orderNo || "-"}</td>
                    <td data-label="金额">{typeof event.amount === "number" ? event.amount : "-"}</td>
                    <td data-label="状态">{event.status || "-"}</td>
                    <td data-label="校验">{event.verified ? "已校验" : "未校验"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="admin-pagination">
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
