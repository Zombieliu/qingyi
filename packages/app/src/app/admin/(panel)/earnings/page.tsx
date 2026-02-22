"use client";
import { t } from "@/lib/i18n/i18n-client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { readCache, writeCache } from "@/lib/shared/client-cache";
import { StateBlock } from "@/app/components/state-block";
import { formatShortDateTime, formatDateISO } from "@/lib/shared/date-utils";

type EarningsItem = {
  companionAddress: string;
  companionName?: string;
  orderCount: number;
  totalAmount: number;
  totalServiceFee: number;
  lastCompletedAt: number | null;
};

type EarningsResponse = {
  totals: {
    orderCount: number;
    totalAmount: number;
    totalServiceFee: number;
  };
  items: EarningsItem[];
  range?: { from: number | null; to: number | null };
};

function formatMoney(value: number) {
  if (!Number.isFinite(value)) return "-";
  return value % 1 === 0 ? value.toFixed(0) : value.toFixed(2);
}

function formatDate(value?: number | null) {
  if (!value) return "-";
  return formatShortDateTime(value);
}

function toDateInput(value: Date) {
  return formatDateISO(value);
}

export default function EarningsPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<EarningsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cacheTtlMs = 60_000;

  const queryKey = useMemo(() => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    params.set("limit", "50");
    return params.toString();
  }, [from, to]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const cacheKey = `cache:admin:earnings:${queryKey}`;
    const cached = readCache<EarningsResponse>(cacheKey, cacheTtlMs, true);
    if (cached) {
      setData(cached.value);
    }
    try {
      const res = await fetch(`/api/admin/earnings?${queryKey}`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(payload?.error || "加载失败");
        return;
      }
      const next = {
        totals: payload?.totals || { orderCount: 0, totalAmount: 0, totalServiceFee: 0 },
        items: Array.isArray(payload?.items) ? payload.items : [],
        range: payload?.range,
      } as EarningsResponse;
      setData(next);
      writeCache(cacheKey, next);
    } catch {
      setError(t("admin.earnings.001"));
    } finally {
      setLoading(false);
    }
  }, [cacheTtlMs, queryKey]);

  const applyPreset = (days: number | null) => {
    if (!days) {
      setFrom("");
      setTo("");
      return;
    }
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - Math.max(0, days - 1));
    setFrom(toDateInput(start));
    setTo(toDateInput(end));
  };

  useEffect(() => {
    load();
  }, [load]);

  const totals = data?.totals || { orderCount: 0, totalAmount: 0, totalServiceFee: 0 };
  const rows = data?.items || [];

  return (
    <div className="admin-section">
      <div className="admin-card">
        <div className="admin-card-header">
          <div>
            <h3>{t("ui.earnings.379")}</h3>
            <p>{t("ui.earnings.380")}</p>
          </div>
          <div className="admin-card-actions">
            <span className="admin-pill">{t("ui.earnings.381")}</span>
            {from || to ? (
              <span className="admin-pill">
                {from || "不限"} ~ {to || "不限"}
              </span>
            ) : (
              <span className="admin-pill">{t("ui.earnings.382")}</span>
            )}
          </div>
        </div>
        <div className="admin-form" style={{ marginTop: 12 }}>
          <label className="admin-field">
            开始日期
            <input
              className="admin-input"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label className="admin-field">
            结束日期
            <input
              className="admin-input"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
          <div className="admin-field" style={{ alignSelf: "flex-end" }}>
            <div className="flex flex-wrap gap-2">
              <button className="admin-btn ghost" type="button" onClick={() => applyPreset(7)}>
                近 7 天
              </button>
              <button className="admin-btn ghost" type="button" onClick={() => applyPreset(30)}>
                近 30 天
              </button>
              <button className="admin-btn ghost" type="button" onClick={() => applyPreset(90)}>
                近 90 天
              </button>
              <button className="admin-btn ghost" type="button" onClick={() => applyPreset(null)}>
                全部
              </button>
              <button className="admin-btn" type="button" onClick={load}>
                刷新
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="admin-grid-cards motion-stack" style={{ marginTop: 16 }}>
        <div className="admin-card">
          <div className="admin-card-header">
            <h3>{t("ui.earnings.383")}</h3>
          </div>
          <div className="admin-stat">{totals.orderCount}</div>
          <p>{t("ui.earnings.384")}</p>
        </div>
        <div className="admin-card">
          <div className="admin-card-header">
            <h3>{t("ui.earnings.385")}</h3>
          </div>
          <div className="admin-stat">¥{formatMoney(totals.totalAmount)}</div>
          <p>{t("ui.earnings.386")}</p>
        </div>
        <div className="admin-card">
          <div className="admin-card-header">
            <h3>{t("ui.earnings.387")}</h3>
          </div>
          <div className="admin-stat">¥{formatMoney(totals.totalServiceFee)}</div>
          <p>{t("ui.earnings.388")}</p>
        </div>
      </div>

      <div className="admin-card" style={{ marginTop: 16 }}>
        <div className="admin-card-header">
          <h3>{t("ui.earnings.389")}</h3>
          <div className="admin-card-actions">
            <span className="admin-pill">共 {rows.length} 人</span>
          </div>
        </div>
        {loading ? (
          <StateBlock
            tone="loading"
            size="compact"
            title={t("admin.earnings.003")}
            description={t("admin.earnings.002")}
          />
        ) : error ? (
          <StateBlock
            tone="danger"
            size="compact"
            title={t("admin.earnings.004")}
            description={error}
          />
        ) : rows.length === 0 ? (
          <StateBlock
            tone="empty"
            size="compact"
            title={t("admin.earnings.005")}
            description={t("admin.earnings.006")}
          />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t("ui.earnings.390")}</th>
                  <th>{t("ui.earnings.391")}</th>
                  <th>{t("ui.earnings.392")}</th>
                  <th>{t("ui.earnings.393")}</th>
                  <th>{t("ui.earnings.394")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.companionAddress}>
                    <td data-label={t("admin.earnings.007")}>
                      <div className="admin-text-strong">{item.companionName || "未绑定"}</div>
                      <div className="admin-meta-faint">{item.companionAddress || "-"}</div>
                    </td>
                    <td data-label={t("admin.earnings.008")}>{item.orderCount}</td>
                    <td data-label={t("admin.earnings.009")}>¥{formatMoney(item.totalAmount)}</td>
                    <td data-label={t("admin.earnings.010")}>
                      ¥{formatMoney(item.totalServiceFee)}
                    </td>
                    <td data-label={t("admin.earnings.011")}>{formatDate(item.lastCompletedAt)}</td>
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
