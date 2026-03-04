"use client";
import { t } from "@/lib/i18n/t";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { Check, Copy, RefreshCw, Search } from "lucide-react";
import type { AdminExaminerApplication, ExaminerStatus } from "@/lib/admin/admin-types";
import { EXAMINER_STATUS_OPTIONS } from "@/lib/admin/admin-types";
import { readCache, writeCache } from "@/lib/shared/client-cache";
import { formatShortDateTime } from "@/lib/shared/date-utils";
import { StateBlock } from "@/app/components/state-block";

export default function ExaminersPage() {
  const [applications, setApplications] = useState<AdminExaminerApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [cacheHint, setCacheHint] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState(t("admin.examiners.001"));
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(1);
  const [cursor, setCursor] = useState<string | null>(null);
  const [prevCursors, setPrevCursors] = useState<Array<string | null>>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportHint, setExportHint] = useState<string | null>(null);
  const [exportScope, setExportScope] = useState<"current" | "filtered">("filtered");
  const pageSize = 20;
  const cacheTtlMs = 60_000;

  const maskAddress = (address?: string) => {
    if (!address) return "-";
    if (address.length <= 12) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const copyAddress = async (applicationId: string, address?: string) => {
    if (!address) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(address);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = address;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      setCopiedId(applicationId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setExportHint("clipboard.copy_failed_retry");
    }
  };

  const formatCsvTime = (ts?: number) => {
    if (!ts) return "";
    return new Date(ts).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const buildCsvRow = (values: Array<string | number | null | undefined>) =>
    values
      .map((value) => {
        const raw = value === null || value === undefined ? "" : String(value);
        return `"${raw.replace(/"/g, '""')}"`;
      })
      .join(",");

  const exportFiltered = async () => {
    if (exporting) return;
    setExporting(true);
    setExportHint(null);
    try {
      let items: AdminExaminerApplication[] = [];
      if (exportScope === "current") {
        items = applications;
      } else {
        const params = new URLSearchParams();
        params.set("pageSize", "200");
        if (statusFilter && statusFilter !== t("admin.panel.examiners.i043"))
          params.set("status", statusFilter);
        if (query.trim()) params.set("q", query.trim());
        let cursorValue: string | null = null;
        let guard = 0;
        while (guard < 200) {
          if (cursorValue) {
            params.set("cursor", cursorValue);
          } else {
            params.delete("cursor");
          }
          const res = await fetch(`/api/admin/examiners?${params.toString()}`);
          if (!res.ok) throw new Error("export_failed");
          const data = await res.json();
          const nextItems: AdminExaminerApplication[] = Array.isArray(data?.items)
            ? data.items
            : [];
          items.push(...nextItems);
          cursorValue = data?.nextCursor || null;
          if (!cursorValue) break;
          guard += 1;
        }
      }

      if (items.length === 0) {
        setExportHint("export.no_data");
        return;
      }

      const headers = [
        t("admin.panel.examiners.i044"),
        t("admin.panel.examiners.i045"),
        t("admin.panel.examiners.i046"),
        t("admin.panel.examiners.i047"),
        t("admin.panel.examiners.i048"),
        t("admin.panel.examiners.i049"),
        t("admin.panel.examiners.i050"),
        t("admin.panel.examiners.i051"),
        t("admin.panel.examiners.i052"),
        t("admin.panel.examiners.i053"),
      ];
      const rows = [buildCsvRow(headers)];
      for (const item of items) {
        rows.push(
          buildCsvRow([
            item.id,
            item.user || "",
            item.contact || "",
            item.userAddress || "",
            item.status || "",
            item.games || "",
            item.rank || "",
            item.liveTime || "",
            item.note || "",
            formatCsvTime(item.createdAt),
          ])
        );
      }

      const bom = "\ufeff";
      const csv = `${bom}${rows.join("\n")}`;
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const scopeLabel =
        exportScope === "current" ? t("admin.panel.examiners.i054") : t("admin.examiners.002");
      link.download = `考官${scopeLabel}_${new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportHint("export.failed");
    } finally {
      setExporting(false);
    }
  };

  const load = useCallback(
    async (cursorValue: string | null, nextPage: number) => {
      setLoading(true);
      try {
        setCacheHint(null);
        const params = new URLSearchParams();
        params.set("pageSize", String(pageSize));
        if (cursorValue) params.set("cursor", cursorValue);
        if (statusFilter && statusFilter !== t("admin.panel.examiners.i055"))
          params.set("status", statusFilter);
        if (query.trim()) params.set("q", query.trim());
        const cacheKey = `cache:admin:examiners:${params.toString()}`;
        const cached = readCache<{ items: AdminExaminerApplication[]; nextCursor?: string | null }>(
          cacheKey,
          cacheTtlMs,
          true
        );
        if (cached) {
          setApplications(Array.isArray(cached.value?.items) ? cached.value.items : []);
          setPage(nextPage);
          setNextCursor(cached.value?.nextCursor || null);
          setCacheHint(cached.fresh ? null : t("admin.examiners.003"));
        }
        const res = await fetch(`/api/admin/examiners?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          const next = Array.isArray(data?.items) ? data.items : [];
          setApplications(next);
          setPage(nextPage);
          setNextCursor(data?.nextCursor || null);
          setCacheHint(null);
          writeCache(cacheKey, { items: next, nextCursor: data?.nextCursor || null });
        }
      } finally {
        setLoading(false);
      }
    },
    [cacheTtlMs, pageSize, query, statusFilter]
  );

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

  const updateApplication = async (
    applicationId: string,
    patch: Partial<AdminExaminerApplication>
  ) => {
    setSaving((prev) => ({ ...prev, [applicationId]: true }));
    try {
      const res = await fetch(`/api/admin/examiners/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const data = await res.json();
        setApplications((prev) => {
          const next = prev.map((r) => (r.id === applicationId ? data : r));
          const params = new URLSearchParams();
          params.set("pageSize", String(pageSize));
          if (cursor) params.set("cursor", cursor);
          if (statusFilter && statusFilter !== t("admin.panel.examiners.i056"))
            params.set("status", statusFilter);
          if (query.trim()) params.set("q", query.trim());
          writeCache(`cache:admin:examiners:${params.toString()}`, { items: next, nextCursor });
          return next;
        });
      }
    } finally {
      setSaving((prev) => ({ ...prev, [applicationId]: false }));
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
            <h3>{t("ui.examiners.353")}</h3>
            <p>{t("ui.examiners.354")}</p>
          </div>
        </div>
        <div className="admin-toolbar">
          <div className="admin-toolbar-grow" style={{ position: "relative" }}>
            <Search size={16} className="admin-input-icon" />
            <input
              className="admin-input"
              style={{ paddingLeft: 36 }}
              placeholder={t("admin.examiners.004")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <select
            className="admin-select"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value={t("admin.examiners.005")}>{t("ui.examiners.355")}</option>
            {EXAMINER_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <select
            className="admin-select"
            value={exportScope}
            onChange={(event) => setExportScope(event.target.value as "current" | "filtered")}
            title={t("admin.examiners.006")}
          >
            <option value="current">{t("ui.examiners.356")}</option>
            <option value="filtered">{t("ui.examiners.357")}</option>
          </select>
          <button className="admin-btn ghost" onClick={exportFiltered} disabled={exporting}>
            {exporting ? t("admin.panel.examiners.i057") : t("admin.examiners.007")}
          </button>
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
        {exportHint && (
          <div className="admin-meta" style={{ marginTop: 8 }}>
            {exportHint}
          </div>
        )}
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h3>{t("ui.examiners.358")}</h3>
          <div className="admin-card-actions">
            <span className="admin-pill">共 {applications.length} 条</span>
            {cacheHint ? <span className="admin-pill">{cacheHint}</span> : null}
          </div>
        </div>
        {loading ? (
          <StateBlock
            tone="loading"
            size="compact"
            title={t("admin.examiners.008")}
            description={t("admin.examiners.009")}
          />
        ) : applications.length === 0 ? (
          <StateBlock
            tone="empty"
            size="compact"
            title={t("admin.examiners.010")}
            description={t("admin.examiners.011")}
          />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t("ui.examiners.359")}</th>
                  <th>{t("ui.examiners.360")}</th>
                  <th>{t("ui.examiners.361")}</th>
                  <th>{t("ui.examiners.362")}</th>
                  <th>{t("ui.examiners.363")}</th>
                  <th>{t("ui.examiners.364")}</th>
                  <th>{t("ui.examiners.365")}</th>
                  <th>{t("ui.examiners.366")}</th>
                  <th>{t("ui.examiners.367")}</th>
                  <th>{t("ui.examiners.368")}</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((item) => (
                  <tr key={item.id}>
                    <td data-label={t("admin.examiners.012")}>
                      <div className="admin-text-strong">{item.user || "-"}</div>
                      <div className="admin-meta">{item.contact || "-"}</div>
                    </td>
                    <td data-label={t("admin.examiners.013")}>{item.games || "-"}</td>
                    <td data-label={t("admin.examiners.014")} className="admin-meta">
                      {item.rank || "-"}
                    </td>
                    <td data-label={t("admin.examiners.015")} className="admin-meta">
                      {item.liveTime || "-"}
                    </td>
                    <td data-label={t("admin.examiners.016")}>
                      <div className="flex gap-1 flex-wrap">
                        {(item.meta?.attachments as string[] | undefined)?.map((src, i) => (
                          <a key={i} href={src} target="_blank" rel="noopener noreferrer">
                            <Image
                              src={src}
                              alt=""
                              width={40}
                              height={40}
                              unoptimized
                              className="w-10 h-10 rounded object-cover border border-slate-200"
                            />
                          </a>
                        ))}
                      </div>
                    </td>
                    <td
                      data-label={t("admin.examiners.017")}
                      className="admin-meta"
                      style={{ maxWidth: 220, wordBreak: "break-all" }}
                    >
                      <div className="flex items-center gap-2">
                        <span title={item.userAddress || ""}>{maskAddress(item.userAddress)}</span>
                        {item.userAddress && (
                          <button
                            type="button"
                            className="admin-btn ghost"
                            style={{
                              padding: "4px 8px",
                              fontSize: 12,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                            onClick={() => copyAddress(item.id, item.userAddress)}
                            title={
                              copiedId === item.id
                                ? t("admin.panel.examiners.i058")
                                : t("admin.examiners.018")
                            }
                            aria-label={t("admin.examiners.019")}
                          >
                            {copiedId === item.id ? <Check size={14} /> : <Copy size={14} />}
                            <span>
                              {copiedId === item.id
                                ? t("admin.panel.examiners.i059")
                                : t("admin.examiners.020")}
                            </span>
                          </button>
                        )}
                      </div>
                    </td>
                    <td data-label={t("admin.examiners.021")}>
                      <select
                        className="admin-select"
                        value={item.status}
                        onChange={(event) => {
                          const nextStatus = event.target.value as ExaminerStatus;
                          setApplications((prev) =>
                            prev.map((r) => (r.id === item.id ? { ...r, status: nextStatus } : r))
                          );
                          updateApplication(item.id, { status: nextStatus });
                        }}
                      >
                        {EXAMINER_STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td data-label={t("admin.examiners.022")}>
                      <input
                        className="admin-input"
                        placeholder={t("admin.examiners.023")}
                        value={item.note || ""}
                        onChange={(event) =>
                          setApplications((prev) =>
                            prev.map((r) =>
                              r.id === item.id ? { ...r, note: event.target.value } : r
                            )
                          )
                        }
                        onBlur={(event) => updateApplication(item.id, { note: event.target.value })}
                      />
                    </td>
                    <td data-label={t("admin.examiners.024")}>
                      {formatShortDateTime(item.createdAt)}
                    </td>
                    <td data-label={t("admin.examiners.025")}>
                      <span className="admin-badge neutral">
                        {saving[item.id] ? t("ui.examiners.526") : t("admin.examiners.026")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="admin-pagination">
          <button className="admin-btn ghost" disabled={prevCursors.length === 0} onClick={goPrev}>
            上一页
          </button>
          <div className="admin-meta">第 {page} 页</div>
          <button className="admin-btn ghost" disabled={!nextCursor} onClick={goNext}>
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}
