"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import type { AdminInvoiceRequest, InvoiceStatus } from "@/lib/admin-types";
import { INVOICE_STATUS_OPTIONS } from "@/lib/admin-types";
import { readCache, writeCache } from "@/app/components/client-cache";

function formatTime(ts: number) {
  return new Date(ts).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function InvoicesPage() {
  const [requests, setRequests] = useState<AdminInvoiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("全部");
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 20;
  const cacheTtlMs = 60_000;

  const load = useCallback(async (nextPage: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(nextPage));
      params.set("pageSize", String(pageSize));
      if (statusFilter && statusFilter !== "全部") params.set("status", statusFilter);
      if (query.trim()) params.set("q", query.trim());
      const cacheKey = `cache:admin:invoices:${params.toString()}`;
      const cached = readCache<{ items: AdminInvoiceRequest[]; page?: number; totalPages?: number }>(
        cacheKey,
        cacheTtlMs,
        true
      );
      if (cached) {
        setRequests(Array.isArray(cached.value?.items) ? cached.value.items : []);
        setPage(cached.value?.page || nextPage);
        setTotalPages(cached.value?.totalPages || 1);
      }
      const res = await fetch(`/api/admin/invoices?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const next = Array.isArray(data?.items) ? data.items : [];
        setRequests(next);
        setPage(data?.page || nextPage);
        setTotalPages(data?.totalPages || 1);
        writeCache(cacheKey, { items: next, page: data?.page || nextPage, totalPages: data?.totalPages || 1 });
      }
    } finally {
      setLoading(false);
    }
  }, [cacheTtlMs, pageSize, query, statusFilter]);

  useEffect(() => {
    const handle = setTimeout(() => load(1), 300);
    return () => clearTimeout(handle);
  }, [load]);

  useEffect(() => {
    load(page);
  }, [load, page]);

  const updateRequest = async (requestId: string, patch: Partial<AdminInvoiceRequest>) => {
    setSaving((prev) => ({ ...prev, [requestId]: true }));
    try {
      const res = await fetch(`/api/admin/invoices/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const data = await res.json();
        setRequests((prev) => {
          const next = prev.map((r) => (r.id === requestId ? data : r));
          const params = new URLSearchParams();
          params.set("page", String(page));
          params.set("pageSize", String(pageSize));
          if (statusFilter && statusFilter !== "全部") params.set("status", statusFilter);
          if (query.trim()) params.set("q", query.trim());
          writeCache(`cache:admin:invoices:${params.toString()}`, { items: next, page, totalPages });
          return next;
        });
      }
    } finally {
      setSaving((prev) => ({ ...prev, [requestId]: false }));
    }
  };

  return (
    <div className="admin-section">
      <div className="admin-card">
        <div className="admin-card-header">
          <div>
            <h3>发票筛选</h3>
            <p>按抬头、税号、订单号与状态快速定位。</p>
          </div>
        </div>
        <div className="admin-toolbar">
          <div className="admin-toolbar-grow" style={{ position: "relative" }}>
            <Search
              size={16}
              className="admin-input-icon"
            />
            <input
              className="admin-input"
              style={{ paddingLeft: 36 }}
              placeholder="搜索抬头 / 税号 / 订单号"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <select className="admin-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="全部">全部状态</option>
            {INVOICE_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <button className="admin-btn ghost" onClick={() => load(1)}>
            <RefreshCw size={16} style={{ marginRight: 6 }} />
            刷新
          </button>
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h3>发票申请列表</h3>
          <div className="admin-card-actions">
            <span className="admin-pill">共 {requests.length} 条</span>
          </div>
        </div>
        {loading ? (
          <p>加载发票申请中...</p>
        ) : requests.length === 0 ? (
          <p>暂无发票申请</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>抬头 / 税号</th>
                  <th>金额</th>
                  <th>订单号</th>
                  <th>联系方式</th>
                  <th>状态</th>
                  <th>备注</th>
                  <th>时间</th>
                  <th>更新</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((item) => (
                  <tr key={item.id}>
                    <td data-label="抬头 / 税号">
                      <div className="admin-text-strong">{item.title || "-"}</div>
                      <div className="admin-meta">{item.taxId || "-"}</div>
                    </td>
                    <td data-label="金额">{typeof item.amount === "number" ? `¥${item.amount}` : "-"}</td>
                    <td data-label="订单号">
                      <div className="admin-meta">{item.orderId || "-"}</div>
                    </td>
                    <td data-label="联系方式">
                      <div className="admin-meta">{item.email || "-"}</div>
                      <div className="admin-meta">{item.contact || "-"}</div>
                    </td>
                    <td data-label="状态">
                      <select
                        className="admin-select"
                        value={item.status}
                        onChange={(event) => {
                          const nextStatus = event.target.value as InvoiceStatus;
                          setRequests((prev) =>
                            prev.map((r) => (r.id === item.id ? { ...r, status: nextStatus } : r))
                          );
                          updateRequest(item.id, { status: nextStatus });
                        }}
                      >
                        {INVOICE_STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td data-label="备注">
                      <input
                        className="admin-input"
                        placeholder="财务备注"
                        value={item.note || ""}
                        onChange={(event) =>
                          setRequests((prev) =>
                            prev.map((r) => (r.id === item.id ? { ...r, note: event.target.value } : r))
                          )
                        }
                        onBlur={(event) => updateRequest(item.id, { note: event.target.value })}
                      />
                    </td>
                    <td data-label="时间">{formatTime(item.createdAt)}</td>
                    <td data-label="更新">
                      <span className="admin-badge neutral">{saving[item.id] ? "保存中" : "已同步"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="admin-pagination">
          <button
            className="admin-btn ghost"
            disabled={page <= 1}
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          >
            上一页
          </button>
          <div className="admin-meta">
            第 {page} / {totalPages} 页
          </div>
          <button
            className="admin-btn ghost"
            disabled={page >= totalPages}
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}
