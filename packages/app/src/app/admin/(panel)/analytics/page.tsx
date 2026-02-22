"use client";
import { t } from "@/lib/i18n/i18n-client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { StateBlock } from "@/app/components/state-block";

type AnalyticsSummary = {
  rangeDays: number;
  totalEvents: number;
  events: Array<{ event: string; count: number; unique: number }>;
  funnel: Array<{ step: string; unique: number; conversionFromPrev: number }>;
  topPaths: Array<{ path: string; count: number }>;
};

type TrendDay = { date: string; views: number; intents: number; orders: number };
type TrendData = {
  rangeDays: number;
  trend: TrendDay[];
  retention: { orderUsers: number; returnUsers: number; rate: number };
};

const RANGE_OPTIONS = [7, 14, 30];

const FUNNEL_COLORS = ["#6366f1", "#8b5cf6", "#a855f7"];
const FUNNEL_LABELS: Record<string, string> = {
  page_view: "访问",
  order_intent: "意向",
  order_create_success: "下单",
};

function FunnelBar({ funnel }: { funnel: AnalyticsSummary["funnel"] }) {
  const max = Math.max(...funnel.map((s) => s.unique), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 0" }}>
      {funnel.map((step, i) => {
        const pct = Math.max((step.unique / max) * 100, 2);
        return (
          <div key={step.step}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 4,
                fontSize: 13,
              }}
            >
              <span style={{ fontWeight: 600 }}>{FUNNEL_LABELS[step.step] || step.step}</span>
              <span style={{ color: "#64748b" }}>
                {step.unique} 人
                {i > 0 && (
                  <span
                    style={{
                      marginLeft: 8,
                      color: step.conversionFromPrev >= 0.5 ? "#10b981" : "#f59e0b",
                    }}
                  >
                    {(step.conversionFromPrev * 100).toFixed(1)}%
                  </span>
                )}
              </span>
            </div>
            <div style={{ background: "#f1f5f9", borderRadius: 6, height: 24, overflow: "hidden" }}>
              <div
                style={{
                  width: `${pct}%`,
                  height: "100%",
                  background: FUNNEL_COLORS[i] || "#6366f1",
                  borderRadius: 6,
                  transition: "width 0.5s ease",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Sparkline({ data, color = "#6366f1" }: { data: number[]; color?: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const h = 40;
  const w = 120;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - (v / max) * (h - 4) - 2;
    return `${x},${y}`;
  });
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function AnalyticsPage() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [trend, setTrend] = useState<TrendData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async (range: number) => {
    setLoading(true);
    try {
      const [summaryRes, trendRes] = await Promise.all([
        fetch(`/api/admin/analytics?days=${range}`),
        fetch(`/api/admin/analytics/trend?days=${range}`),
      ]);
      if (summaryRes.ok) setData(await summaryRes.json());
      if (trendRes.ok) setTrend(await trendRes.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(days);
  }, [days]);

  return (
    <div className="admin-section">
      <div className="admin-card">
        <div className="admin-card-header">
          <div>
            <h3>{t("ui.analytics.455")}</h3>
            <p>{t("ui.analytics.456")}</p>
          </div>
          <div className="admin-card-actions">
            {RANGE_OPTIONS.map((range) => (
              <button
                key={range}
                className={`admin-btn ${days === range ? "primary" : "ghost"}`}
                onClick={() => setDays(range)}
              >
                近{range}天
              </button>
            ))}
            <button className="admin-btn ghost" onClick={() => load(days)}>
              <RefreshCw size={16} style={{ marginRight: 6 }} />
              刷新
            </button>
          </div>
        </div>
        {loading ? (
          <StateBlock
            tone="loading"
            size="compact"
            title={t("admin.analytics.002")}
            description={t("admin.analytics.001")}
          />
        ) : data ? (
          <div className="admin-grid-cards" style={{ marginTop: 6 }}>
            <div className="admin-card admin-card--subtle">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                <div>
                  <h3>{t("ui.analytics.457")}</h3>
                  <div className="admin-stat">{data.totalEvents}</div>
                  <p>最近 {data.rangeDays} 天事件记录</p>
                </div>
              </div>
            </div>
            <div className="admin-card admin-card--subtle">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                <div>
                  <h3>{t("ui.analytics.458")}</h3>
                  <div className="admin-stat">
                    {data.events.find((item) => item.event === "page_view")?.unique || 0}
                  </div>
                  <p>{t("ui.analytics.459")}</p>
                </div>
                {trend && <Sparkline data={trend.trend.map((d) => d.views)} color="#6366f1" />}
              </div>
            </div>
            <div className="admin-card admin-card--subtle">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                <div>
                  <h3>{t("ui.analytics.460")}</h3>
                  <div className="admin-stat">
                    {data.events.find((item) => item.event === "order_intent")?.unique || 0}
                  </div>
                  <p>{t("ui.analytics.461")}</p>
                </div>
                {trend && <Sparkline data={trend.trend.map((d) => d.intents)} color="#8b5cf6" />}
              </div>
            </div>
            <div className="admin-card admin-card--subtle">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                <div>
                  <h3>{t("ui.analytics.462")}</h3>
                  <div className="admin-stat">
                    {data.events.find((item) => item.event === "order_create_success")?.unique || 0}
                  </div>
                  <p>{t("ui.analytics.463")}</p>
                </div>
                {trend && <Sparkline data={trend.trend.map((d) => d.orders)} color="#a855f7" />}
              </div>
            </div>
          </div>
        ) : (
          <StateBlock
            tone="empty"
            size="compact"
            title={t("admin.analytics.004")}
            description={t("admin.analytics.003")}
          />
        )}
      </div>

      {/* Retention Card */}
      {!loading && trend && (
        <div className="admin-card">
          <div className="admin-card-header">
            <h3>{t("ui.analytics.464")}</h3>
          </div>
          <div className="admin-grid-cards" style={{ marginTop: 6 }}>
            <div className="admin-card admin-card--subtle">
              <h3>{t("ui.analytics.465")}</h3>
              <div className="admin-stat">{trend.retention.orderUsers}</div>
              <p>{t("ui.analytics.466")}</p>
            </div>
            <div className="admin-card admin-card--subtle">
              <h3>{t("ui.analytics.467")}</h3>
              <div className="admin-stat">{trend.retention.returnUsers}</div>
              <p>{t("ui.analytics.468")}</p>
            </div>
            <div className="admin-card admin-card--subtle">
              <h3>{t("ui.analytics.469")}</h3>
              <div className="admin-stat">{trend.retention.rate}%</div>
              <p>{t("ui.analytics.470")}</p>
            </div>
          </div>
        </div>
      )}

      <div className="admin-card">
        <div className="admin-card-header">
          <h3>{t("ui.analytics.471")}</h3>
        </div>
        {loading ? (
          <StateBlock
            tone="loading"
            size="compact"
            title={t("admin.analytics.006")}
            description={t("admin.analytics.005")}
          />
        ) : data && data.funnel.length > 0 ? (
          <FunnelBar funnel={data.funnel} />
        ) : (
          <StateBlock
            tone="empty"
            size="compact"
            title={t("admin.analytics.007")}
            description={t("admin.analytics.008")}
          />
        )}
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h3>{t("ui.analytics.472")}</h3>
        </div>
        {loading ? (
          <StateBlock
            tone="loading"
            size="compact"
            title={t("admin.analytics.010")}
            description={t("admin.analytics.009")}
          />
        ) : data ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t("ui.analytics.473")}</th>
                  <th>{t("ui.analytics.474")}</th>
                  <th>{t("ui.analytics.475")}</th>
                </tr>
              </thead>
              <tbody>
                {data.events.map((item) => (
                  <tr key={item.event}>
                    <td data-label={t("admin.analytics.011")} className="admin-text-strong">
                      {item.event}
                    </td>
                    <td data-label={t("admin.analytics.012")}>{item.count}</td>
                    <td data-label={t("admin.analytics.013")}>{item.unique}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <StateBlock
            tone="empty"
            size="compact"
            title={t("admin.analytics.015")}
            description={t("admin.analytics.014")}
          />
        )}
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h3>{t("ui.analytics.476")}</h3>
        </div>
        {loading ? (
          <StateBlock
            tone="loading"
            size="compact"
            title={t("admin.analytics.017")}
            description={t("admin.analytics.016")}
          />
        ) : data ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t("ui.analytics.477")}</th>
                  <th>{t("ui.analytics.478")}</th>
                </tr>
              </thead>
              <tbody>
                {data.topPaths.map((item) => (
                  <tr key={item.path}>
                    <td data-label={t("admin.analytics.018")} className="admin-text-strong">
                      {item.path}
                    </td>
                    <td data-label={t("admin.analytics.019")}>{item.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <StateBlock
            tone="empty"
            size="compact"
            title={t("admin.analytics.021")}
            description={t("admin.analytics.020")}
          />
        )}
      </div>
    </div>
  );
}
