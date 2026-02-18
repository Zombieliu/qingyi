"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import type { AdminSupportTicket, SupportStatus } from "@/lib/admin/admin-types";
import { SUPPORT_STATUS_OPTIONS } from "@/lib/admin/admin-types";
import { readCache, writeCache } from "@/app/components/client-cache";
import { StateBlock } from "@/app/components/state-block";

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
  const [cacheHint, setCacheHint] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("全部");
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(1);
  const [cursor, setCursor] = useState<string | null>(null);
  const [prevCursors, setPrevCursors] = useState<Array<string | null>>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const pageSize = 20;
  const cacheTtlMs = 60_000;

  const load = useCallback(async (cursorValue: string | null, nextPage: number) => {
    setLoading(true);
    try {
      setCacheHint(null);
      const params = new URLSearchParams();
      params.set("pageSize", String(pageSize));
      if (cursorValue) params.set("cursor", cursorValue);
      if (statusFilter && statusFilter !== "全部") params.set("status", statusFilter);
      if (query.trim()) params.set("q", query.trim());
      const cacheKey = `cache:admin:support:${params.toString()}`;
      const cached = readCache<{ items: AdminSupportTicket[]; nextCursor?: string | null }>(
        cacheKey,
        cacheTtlMs,
        true
      );
      if (cached) {
        setTickets(Array.isArray(cached.value?.items) ? cached.value.items : []);
        setPage(nextPage);
        setNextCursor(cached.value?.nextCursor || null);
        setCacheHint(cached.fresh ? null : "显示缓存数据，正在刷新…");
      }
      const res = await fetch(`/api/admin/support?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const next = Array.isArray(data?.items) ? data.items : [];
        setTickets(next);
        setPage(nextPage);
        setNextCursor(data?.nextCursor || null);
        setCacheHint(null);
        writeCache(cacheKey, { items: next, nextCursor: data?.nextCursor || null });
      }
    } finally {
      setLoading(false);
    }
  }, [cacheTtlMs, pageSize, query, statusFilter]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setPrevCursors([]);
      setCursor(null);
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [query, statusFilter]);

  useEffect(() => {
    load(cursor, page);
  }, [load, cursor, page]);

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
        setTickets((prev) => {
          const next = prev.map((t) => (t.id === ticketId ? data : t));
          const params = new URLSearchParams();
          params.set("pageSize", String(pageSize));
          if (cursor) params.set("cursor", cursor);
          if (statusFilter && statusFilter !== "全部") params.set("status", statusFilter);
          if (query.trim()) params.set("q", query.trim());
          writeCache(`cache:admin:support:${params.toString()}`, {
            items: next,
            nextCursor,
          });
          return next;
        });
      }
    } finally {
      setSaving((prev) => ({ ...prev, [ticketId]: false }));
    }
  };

  const goPrev = () => {
    setPrevCursors((prev) => {
      if (prev.length === 0) return prev;
      const nextPrev = prev.slice(0, -1);
      const prevCursor = prev[prev.length - 1] ?? null;
      setCursor(prevCursor);
      setPage((value) => Math.max(1, value - 1));
      return nextPrev;
    });
  };

  const goNext = () => {
    if (!nextCursor) return;
    setPrevCursors((prev) => [...prev, cursor]);
    setCursor(nextCursor);
    setPage((value) => value + 1);
  };

  return (
    <div className="admin-section">
      <div className="admin-card">
        <div className="admin-card-header">
          <div>
            <h3>工单筛选</h3>
            <p>快速定位客户问题与处理进度。</p>
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
              placeholder="搜索联系人 / 主题 / 内容"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <select className="admin-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="全部">全部状态</option>
            {SUPPORT_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <button
            className="admin-btn ghost"
            onClick={() => {
              setPrevCursors([]);
              setCursor(null);
              setPage(1);
            }}
          >
            <RefreshCw size={16} style={{ marginRight: 6 }} />
            刷新
          </button>
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h3>工单列表</h3>
          <div className="admin-card-actions">
            <span className="admin-pill">共 {tickets.length} 条</span>
            {cacheHint ? <span className="admin-pill">{cacheHint}</span> : null}
          </div>
        </div>
        {loading ? (
          <StateBlock tone="loading" size="compact" title="加载工单中" description="正在同步工单列表" />
        ) : tickets.length === 0 ? (
          <StateBlock tone="empty" size="compact" title="暂无客服工单" description="目前没有待处理工单" />
        ) : (
          <div className="admin-table-wrap">
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
                    <td data-label="用户">
                      <div className="admin-text-strong">{ticket.userName || "访客"}</div>
                      <div className="admin-meta">{ticket.contact || "-"}</div>
                      <div className="admin-meta-faint">{ticket.id}</div>
                    </td>
                    <td data-label="主题">
                      <div className="admin-text-strong">{ticket.topic || "其他"}</div>
                    </td>
                    <td data-label="内容">
                      <div className="admin-meta">{ticket.message}</div>
                    </td>
                    <td data-label="状态">
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
                    <td data-label="备注">
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
                    <td data-label="时间">{formatTime(ticket.createdAt)}</td>
                    <td data-label="更新">
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
        <div className="admin-pagination">
          <button
            className="admin-btn ghost"
            disabled={prevCursors.length === 0}
            onClick={goPrev}
          >
            上一页
          </button>
          <div className="admin-meta">
            第 {page} 页
          </div>
          <button
            className="admin-btn ghost"
            disabled={!nextCursor}
            onClick={goNext}
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}
