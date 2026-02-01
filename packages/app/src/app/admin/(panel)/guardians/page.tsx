"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import type { AdminGuardianApplication, GuardianStatus } from "@/lib/admin-types";
import { GUARDIAN_STATUS_OPTIONS } from "@/lib/admin-types";

function formatTime(ts: number) {
  return new Date(ts).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function GuardiansPage() {
  const [applications, setApplications] = useState<AdminGuardianApplication[]>([]);
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
      const res = await fetch(`/api/admin/guardians?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setApplications(Array.isArray(data?.items) ? data.items : []);
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

  const updateApplication = async (applicationId: string, patch: Partial<AdminGuardianApplication>) => {
    setSaving((prev) => ({ ...prev, [applicationId]: true }));
    try {
      const res = await fetch(`/api/admin/guardians/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const data = await res.json();
        setApplications((prev) => prev.map((r) => (r.id === applicationId ? data : r)));
      }
    } finally {
      setSaving((prev) => ({ ...prev, [applicationId]: false }));
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
              placeholder="搜索姓名 / 游戏 / 联系方式"
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
            {GUARDIAN_STATUS_OPTIONS.map((status) => (
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
          <p>加载护航申请中...</p>
        ) : applications.length === 0 ? (
          <p>暂无护航申请</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>申请人</th>
                  <th>擅长游戏</th>
                  <th>经验</th>
                  <th>可接单时段</th>
                  <th>状态</th>
                  <th>备注</th>
                  <th>时间</th>
                  <th>更新</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{item.user || "-"}</div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>{item.contact || "-"}</div>
                    </td>
                    <td>{item.games || "-"}</td>
                    <td style={{ fontSize: 12, color: "#475569" }}>{item.experience || "-"}</td>
                    <td style={{ fontSize: 12, color: "#475569" }}>{item.availability || "-"}</td>
                    <td>
                      <select
                        className="admin-select"
                        value={item.status}
                        onChange={(event) => {
                          const nextStatus = event.target.value as GuardianStatus;
                          setApplications((prev) =>
                            prev.map((r) => (r.id === item.id ? { ...r, status: nextStatus } : r))
                          );
                          updateApplication(item.id, { status: nextStatus });
                        }}
                      >
                        {GUARDIAN_STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        className="admin-input"
                        placeholder="审核备注"
                        value={item.note || ""}
                        onChange={(event) =>
                          setApplications((prev) =>
                            prev.map((r) => (r.id === item.id ? { ...r, note: event.target.value } : r))
                          )
                        }
                        onBlur={(event) => updateApplication(item.id, { note: event.target.value })}
                      />
                    </td>
                    <td>{formatTime(item.createdAt)}</td>
                    <td>
                      <span className="admin-badge neutral">{saving[item.id] ? "保存中" : "已同步"}</span>
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
