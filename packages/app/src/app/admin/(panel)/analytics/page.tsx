"use client";

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
            <h3>增长概览</h3>
            <p>查看最近周期内的访问与转化表现。</p>
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
          <StateBlock tone="loading" size="compact" title="加载中" description="同步增长概览数据" />
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
                  <h3>事件总量</h3>
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
                  <h3>访问用户</h3>
                  <div className="admin-stat">
                    {data.events.find((item) => item.event === "page_view")?.unique || 0}
                  </div>
                  <p>独立访问用户数</p>
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
                  <h3>下单意向</h3>
                  <div className="admin-stat">
                    {data.events.find((item) => item.event === "order_intent")?.unique || 0}
                  </div>
                  <p>触发下单意向的用户</p>
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
                  <h3>下单成功</h3>
                  <div className="admin-stat">
                    {data.events.find((item) => item.event === "order_create_success")?.unique || 0}
                  </div>
                  <p>完成下单的用户</p>
                </div>
                {trend && <Sparkline data={trend.trend.map((d) => d.orders)} color="#a855f7" />}
              </div>
            </div>
          </div>
        ) : (
          <StateBlock tone="empty" size="compact" title="暂无数据" description="稍后刷新再看" />
        )}
      </div>

      {/* Retention Card */}
      {!loading && trend && (
        <div className="admin-card">
          <div className="admin-card-header">
            <h3>用户留存</h3>
          </div>
          <div className="admin-grid-cards" style={{ marginTop: 6 }}>
            <div className="admin-card admin-card--subtle">
              <h3>下单用户</h3>
              <div className="admin-stat">{trend.retention.orderUsers}</div>
              <p>期间内完成下单的用户</p>
            </div>
            <div className="admin-card admin-card--subtle">
              <h3>回访用户</h3>
              <div className="admin-stat">{trend.retention.returnUsers}</div>
              <p>下单后再次访问的用户</p>
            </div>
            <div className="admin-card admin-card--subtle">
              <h3>回访率</h3>
              <div className="admin-stat">{trend.retention.rate}%</div>
              <p>下单用户的回访比例</p>
            </div>
          </div>
        </div>
      )}

      <div className="admin-card">
        <div className="admin-card-header">
          <h3>转化漏斗</h3>
        </div>
        {loading ? (
          <StateBlock tone="loading" size="compact" title="加载中" description="同步转化漏斗" />
        ) : data && data.funnel.length > 0 ? (
          <FunnelBar funnel={data.funnel} />
        ) : (
          <StateBlock
            tone="empty"
            size="compact"
            title="暂无数据"
            description="暂未收集到漏斗数据"
          />
        )}
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h3>事件分布</h3>
        </div>
        {loading ? (
          <StateBlock tone="loading" size="compact" title="加载中" description="同步热门页面" />
        ) : data ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>事件</th>
                  <th>总量</th>
                  <th>独立人数</th>
                </tr>
              </thead>
              <tbody>
                {data.events.map((item) => (
                  <tr key={item.event}>
                    <td data-label="事件" className="admin-text-strong">
                      {item.event}
                    </td>
                    <td data-label="总量">{item.count}</td>
                    <td data-label="独立人数">{item.unique}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <StateBlock tone="empty" size="compact" title="暂无数据" description="暂无热门页面记录" />
        )}
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h3>热门页面</h3>
        </div>
        {loading ? (
          <StateBlock tone="loading" size="compact" title="加载中" description="同步事件排行" />
        ) : data ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>页面</th>
                  <th>访问次数</th>
                </tr>
              </thead>
              <tbody>
                {data.topPaths.map((item) => (
                  <tr key={item.path}>
                    <td data-label="页面" className="admin-text-strong">
                      {item.path}
                    </td>
                    <td data-label="访问次数">{item.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <StateBlock tone="empty" size="compact" title="暂无数据" description="暂无事件排行记录" />
        )}
      </div>
    </div>
  );
}
