"use client";
import { t } from "@/lib/i18n/i18n-client";

import { useEffect, useState } from "react";
import { TrendingUp, Users, DollarSign, BarChart3, ArrowUpDown } from "lucide-react";
import { StateBlock } from "@/app/components/state-block";

type RevenueSummary = {
  totalRevenue: number;
  completedOrders: number;
  avgOrderValue: number;
  cancelledAmount: number;
  totalServiceFee: number;
};

type DailyRevenue = { date: string; revenue: number; orders: number; serviceFee: number };
type ByItem = { item: string; revenue: number; count: number };

type PerformanceEntry = {
  playerId: string;
  name: string;
  total: number;
  completed: number;
  cancelled: number;
  completionRate: number;
  revenue: number;
  avgRating: number | null;
};

type SortKey = "revenue" | "total" | "completionRate" | "avgRating";

export default function RevenuePerformancePage() {
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<RevenueSummary | null>(null);
  const [daily, setDaily] = useState<DailyRevenue[]>([]);
  const [byItem, setByItem] = useState<ByItem[]>([]);
  const [performance, setPerformance] = useState<PerformanceEntry[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/admin/revenue?days=${days}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/admin/performance?days=${days}`).then((r) => (r.ok ? r.json() : null)),
    ]).then(([rev, perf]) => {
      if (cancelled) return;
      if (rev) {
        setSummary(rev.summary);
        setDaily(rev.daily || []);
        setByItem(rev.byItem || []);
      }
      if (perf) {
        setPerformance(perf.performance || []);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [days]);

  const sorted = [...performance].sort((a, b) => {
    const av = a[sortKey] ?? 0;
    const bv = b[sortKey] ?? 0;
    return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-page">
        <StateBlock tone="loading" title={t("ui.revenue.424")} description={t("ui.revenue.425")} />
      </div>
    );
  }

  const maxDailyRevenue = Math.max(...daily.map((d) => d.revenue), 1);

  return (
    <div className="admin-page" style={{ maxWidth: 960 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{t("ui.revenue.426")}</h2>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="admin-input"
          style={{ width: "auto", padding: "4px 8px", fontSize: 13 }}
        >
          <option value={7}>{t("ui.revenue.427")}</option>
          <option value={14}>{t("ui.revenue.428")}</option>
          <option value={30}>{t("ui.revenue.429")}</option>
          <option value={60}>{t("ui.revenue.430")}</option>
          <option value={90}>{t("ui.revenue.431")}</option>
        </select>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
            marginBottom: 24,
          }}
        >
          <SummaryCard
            icon={<DollarSign size={18} />}
            label={t("ui.revenue.432")}
            value={`¥${summary.totalRevenue.toFixed(2)}`}
          />
          <SummaryCard
            icon={<BarChart3 size={18} />}
            label={t("ui.revenue.433")}
            value={String(summary.completedOrders)}
          />
          <SummaryCard
            icon={<TrendingUp size={18} />}
            label={t("ui.revenue.434")}
            value={`¥${summary.avgOrderValue.toFixed(2)}`}
          />
          <SummaryCard
            icon={<DollarSign size={18} />}
            label={t("ui.revenue.435")}
            value={`¥${summary.totalServiceFee.toFixed(2)}`}
          />
        </div>
      )}

      {/* Daily Revenue Chart (simple bar chart) */}
      {daily.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{t("ui.revenue.436")}</h3>
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 2,
              height: 120,
              padding: "0 4px",
            }}
          >
            {daily.map((d) => (
              <div
                key={d.date}
                style={{
                  flex: 1,
                  minWidth: 4,
                  maxWidth: 24,
                  background: "#22d3ee",
                  borderRadius: "2px 2px 0 0",
                  height: `${Math.max(2, (d.revenue / maxDailyRevenue) * 100)}%`,
                  position: "relative",
                }}
                title={`${d.date}: ¥${d.revenue.toFixed(2)} (${d.orders}单)`}
              />
            ))}
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 11,
              color: "#94a3b8",
              marginTop: 4,
            }}
          >
            <span>{daily[0]?.date}</span>
            <span>{daily[daily.length - 1]?.date}</span>
          </div>
        </div>
      )}

      {/* By Item */}
      {byItem.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{t("ui.revenue.437")}</h3>
          <div style={{ display: "grid", gap: 6 }}>
            {byItem.slice(0, 10).map((item) => (
              <div
                key={item.item}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13,
                  padding: "6px 0",
                  borderBottom: "1px solid #f1f5f9",
                }}
              >
                <span>{item.item}</span>
                <span style={{ color: "#0f172a", fontWeight: 600 }}>
                  ¥{item.revenue.toFixed(2)} ({item.count}单)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Performance Table */}
      <div>
        <h3
          style={{
            fontSize: 14,
            fontWeight: 600,
            marginBottom: 8,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Users size={16} /> 陪练绩效
        </h3>
        {sorted.length === 0 ? (
          <div style={{ color: "#94a3b8", fontSize: 13 }}>{t("ui.revenue.438")}</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>
                  <th style={{ padding: "8px 6px" }}>{t("ui.revenue.439")}</th>
                  <SortTh
                    label={t("ui.revenue.440")}
                    sortKey="total"
                    current={sortKey}
                    asc={sortAsc}
                    onClick={toggleSort}
                  />
                  <SortTh
                    label={t("ui.revenue.441")}
                    sortKey="completionRate"
                    current={sortKey}
                    asc={sortAsc}
                    onClick={toggleSort}
                  />
                  <SortTh
                    label={t("ui.revenue.442")}
                    sortKey="revenue"
                    current={sortKey}
                    asc={sortAsc}
                    onClick={toggleSort}
                  />
                  <SortTh
                    label={t("ui.revenue.443")}
                    sortKey="avgRating"
                    current={sortKey}
                    asc={sortAsc}
                    onClick={toggleSort}
                  />
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => (
                  <tr key={p.playerId} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "8px 6px", fontWeight: 500 }}>{p.name}</td>
                    <td style={{ padding: "8px 6px" }}>
                      {p.completed}/{p.total}
                    </td>
                    <td style={{ padding: "8px 6px" }}>
                      <span
                        style={{
                          color:
                            p.completionRate >= 0.8
                              ? "#16a34a"
                              : p.completionRate >= 0.5
                                ? "#ca8a04"
                                : "#dc2626",
                        }}
                      >
                        {(p.completionRate * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td style={{ padding: "8px 6px", fontWeight: 600 }}>¥{p.revenue.toFixed(2)}</td>
                    <td style={{ padding: "8px 6px" }}>
                      {p.avgRating != null ? `${p.avgRating.toFixed(1)} ⭐` : "—"}
                    </td>
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

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          color: "#64748b",
          fontSize: 12,
          marginBottom: 4,
        }}
      >
        {icon} {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: "#0f172a" }}>{value}</div>
    </div>
  );
}

function SortTh({
  label,
  sortKey,
  current,
  asc,
  onClick,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  asc: boolean;
  onClick: (key: SortKey) => void;
}) {
  const active = current === sortKey;
  return (
    <th
      style={{ padding: "8px 6px", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
      onClick={() => onClick(sortKey)}
    >
      {label} <ArrowUpDown size={12} style={{ opacity: active ? 1 : 0.3, display: "inline" }} />
      {active && <span style={{ fontSize: 10 }}>{asc ? "↑" : "↓"}</span>}
    </th>
  );
}
