"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { MantouWithdrawRequest, MantouWithdrawStatus } from "@/lib/admin-types";
import { MANTOU_WITHDRAW_STATUS_OPTIONS } from "@/lib/admin-types";

function formatTime(ts: number) {
  return new Date(ts).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MantouWithdrawPage() {
  const [requests, setRequests] = useState<MantouWithdrawRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("全部");
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 20;

  const load = useCallback(
    async (nextPage: number) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("page", String(nextPage));
        params.set("pageSize", String(pageSize));
        if (statusFilter && statusFilter !== "全部") params.set("status", statusFilter);
        const res = await fetch(`/api/admin/mantou/withdraws?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setRequests(Array.isArray(data?.items) ? data.items : []);
          setPage(data?.page || nextPage);
          setTotalPages(data?.totalPages || 1);
        }
      } finally {
        setLoading(false);
      }
    },
    [pageSize, statusFilter]
  );

  useEffect(() => {
    load(1);
  }, [load]);

  const updateRequest = async (requestId: string, status: MantouWithdrawStatus) => {
    setSaving((prev) => ({ ...prev, [requestId]: true }));
    try {
      const res = await fetch(`/api/admin/mantou/withdraws/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        const data = await res.json();
        setRequests((prev) => prev.map((r) => (r.id === requestId ? data : r)));
      }
    } finally {
      setSaving((prev) => ({ ...prev, [requestId]: false }));
    }
  };

  return (
    <div className="admin-section">
      <div className="admin-card">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <select
            className="admin-select"
            style={{ minWidth: 160 }}
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="全部">全部状态</option>
            {MANTOU_WITHDRAW_STATUS_OPTIONS.map((status) => (
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
        {loading ? (
          <p>加载提现申请中...</p>
        ) : requests.length === 0 ? (
          <p>暂无提现申请</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>打手地址</th>
                  <th>数量</th>
                  <th>收款账号</th>
                  <th>状态</th>
                  <th>备注</th>
                  <th>时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div style={{ fontSize: 12, color: "#64748b" }}>{item.address}</div>
                    </td>
                    <td>{item.amount}</td>
                    <td>
                      <div style={{ fontSize: 12, color: "#64748b" }}>{item.account || "-"}</div>
                    </td>
                    <td>
                      <span className={`admin-badge ${item.status === "待审核" ? "warning" : "neutral"}`}>
                        {item.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: 12, color: "#64748b" }}>{item.note || "-"}</div>
                    </td>
                    <td>{formatTime(item.createdAt)}</td>
                    <td>
                      {item.status === "待审核" ? (
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            className="admin-btn"
                            disabled={saving[item.id]}
                            onClick={() => updateRequest(item.id, "已通过")}
                          >
                            通过
                          </button>
                          <button
                            className="admin-btn ghost"
                            disabled={saving[item.id]}
                            onClick={() => updateRequest(item.id, "已拒绝")}
                          >
                            拒绝
                          </button>
                        </div>
                      ) : (
                        <span className="admin-badge neutral">已处理</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, alignItems: "center" }}>
          <button
            className="admin-btn ghost"
            disabled={page <= 1}
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          >
            上一页
          </button>
          <span style={{ color: "#64748b" }}>
            第 {page} / {totalPages} 页
          </span>
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
