"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { readCache, writeCache } from "@/app/components/client-cache";
import { StateBlock } from "@/app/components/state-block";

type AuditLog = {
  id: string;
  actorRole: string;
  action: string;
  targetType?: string;
  targetId?: string;
  ip?: string;
  createdAt: number;
};

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const cacheTtlMs = 60_000;

  const load = useCallback(async (nextPage: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(nextPage));
      if (query.trim()) params.set("q", query.trim());
      const cacheKey = `cache:admin:audit:${params.toString()}`;
      const cached = readCache<{ items: AuditLog[]; page?: number; totalPages?: number }>(cacheKey, cacheTtlMs, true);
      if (cached) {
        setLogs(Array.isArray(cached.value?.items) ? cached.value.items : []);
        setPage(cached.value?.page || nextPage);
        setTotalPages(cached.value?.totalPages || 1);
      }
      const res = await fetch(`/api/admin/audit?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const next = Array.isArray(data?.items) ? data.items : [];
        setLogs(next);
        setPage(data?.page || nextPage);
        setTotalPages(data?.totalPages || 1);
        writeCache(cacheKey, { items: next, page: data?.page || nextPage, totalPages: data?.totalPages || 1 });
      }
    } finally {
      setLoading(false);
    }
  }, [cacheTtlMs, query]);

  useEffect(() => {
    const handle = setTimeout(() => load(1), 300);
    return () => clearTimeout(handle);
  }, [load]);

  useEffect(() => {
    load(page);
  }, [load, page]);

  return (
    <div className="admin-section">
      <div className="admin-card">
        <div className="admin-card-header">
          <div>
            <h3>审计筛选</h3>
            <p>按操作与目标快速定位关键记录。</p>
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
              placeholder="搜索 action / 目标"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <button className="admin-btn ghost" onClick={() => load(1)}>
            <RefreshCw size={16} style={{ marginRight: 6 }} />
            刷新
          </button>
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h3>审计日志</h3>
          <div className="admin-card-actions">
            <span className="admin-pill">共 {logs.length} 条</span>
          </div>
        </div>
        {loading ? (
          <StateBlock tone="loading" size="compact" title="加载中" description="正在同步审计日志" />
        ) : logs.length === 0 ? (
          <StateBlock tone="empty" size="compact" title="暂无审计记录" description="暂时没有可展示的日志" />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>角色</th>
                  <th>操作</th>
                  <th>目标</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td data-label="时间">{new Date(log.createdAt).toLocaleString()}</td>
                    <td data-label="角色">{log.actorRole}</td>
                    <td data-label="操作">{log.action}</td>
                    <td data-label="目标">{log.targetType ? `${log.targetType}:${log.targetId || "-"}` : "-"}</td>
                    <td data-label="IP">{log.ip || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="admin-pagination">
          <button className="admin-btn ghost" disabled={page <= 1} onClick={() => setPage((prev) => prev - 1)}>
            上一页
          </button>
          <div className="admin-meta">
            第 {page} / {totalPages} 页
          </div>
          <button className="admin-btn ghost" disabled={page >= totalPages} onClick={() => setPage((prev) => prev + 1)}>
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}
