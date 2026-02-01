"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import type { AdminSupportTicket, SupportStatus } from "@/lib/admin-types";
import { SUPPORT_STATUS_OPTIONS } from "@/lib/admin-types";

function formatTime(ts: number) {
  return new Date(ts).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SupportPage() {
  const [tickets, setTickets] = useState<AdminSupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("全部");
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 20;

  const load = async (nextPage = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(nextPage));
      params.set("pageSize", String(pageSize));
      if (statusFilter && statusFilter !== "全部") params.set("status", statusFilter);
      if (query.trim()) params.set("q", query.trim());
      const res = await fetch(`/api/admin/support?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setTickets(Array.isArray(data?.items) ? data.items : []);
        setPage(data?.page || nextPage);
        setTotalPages(data?.totalPages || 1);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handle = setTimeout(() => load(1), 300);
    return () => clearTimeout(handle);
  }, [query, statusFilter]);

  useEffect(() => {
    load(page);
  }, [page]);

  const updateTicket = async (ticketId: string, patch: Partial<AdminSupportTicket>) => {
    setSaving((prev) => ({ ...prev, [ticketId]: true }));
    try {
      const res = await fetch(`/api/admin/support/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const data = await res.json();
        setTickets((prev) => prev.map((t) => (t.id === ticketId ? data : t)));
      }
    } finally {
      setSaving((prev) => ({ ...prev, [ticketId]: false }));
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
              placeholder="搜索联系人 / 主题 / 内容"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <select
            className="admin-select"
            style={{ minWidth: 160 }}
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="全部">全部状态</option>
            {SUPPORT_STATUS_OPTIONS.map((status) => (
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
          <p>加载工单中...</p>
        ) : tickets.length === 0 ? (
          <p>暂无客服工单</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>用户</th>
                  <th>主题</th>
                  <th>内容</th>
                  <th>状态</th>
                  <th>备注</th>
                  <th>时间</th>
                  <th>更新</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr key={ticket.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{ticket.userName || "访客"}</div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>{ticket.contact || "-"}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>{ticket.id}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{ticket.topic || "其他"}</div>
                    </td>
                    <td>
                      <div style={{ fontSize: 12, color: "#475569" }}>{ticket.message}</div>
                    </td>
                    <td>
                      <select
                        className="admin-select"
                        value={ticket.status}
                        onChange={(event) => {
                          const nextStatus = event.target.value as SupportStatus;
                          setTickets((prev) =>
                            prev.map((item) => (item.id === ticket.id ? { ...item, status: nextStatus } : item))
                          );
                          updateTicket(ticket.id, { status: nextStatus });
                        }}
                      >
                        {SUPPORT_STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        className="admin-input"
                        placeholder="跟进备注"
                        value={ticket.note || ""}
                        onChange={(event) =>
                          setTickets((prev) =>
                            prev.map((item) =>
                              item.id === ticket.id ? { ...item, note: event.target.value } : item
                            )
                          )
                        }
                        onBlur={(event) => updateTicket(ticket.id, { note: event.target.value })}
                      />
                    </td>
                    <td>{formatTime(ticket.createdAt)}</td>
                    <td>
                      <span className="admin-badge neutral">
                        {saving[ticket.id] ? "保存中" : "已同步"}
                      </span>
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
          <div style={{ fontSize: 12, color: "#64748b" }}>
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
