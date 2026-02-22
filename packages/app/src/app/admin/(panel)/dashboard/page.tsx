"use client";
import { useEffect, useState, useCallback } from "react";

type DashboardData = {
  timestamp: string;
  realtime: {
    todayOrders: number;
    todayRevenue: number;
    todayServiceFee: number;
    todayUsers: number;
    todayCompleted: number;
    yesterdayRevenue: number;
    revenueChange: number;
  };
  trends: { date: string; orders: number; revenue: number; users: number }[];
  hourly: { hour: number; count: number }[];
  distribution: { stage: string; count: number }[];
  topPlayers: { id: string; name: string; orders: number; revenue: number }[];
  funnel: { step: string; count: number }[];
  comparison: {
    revenue: { current: number; previous: number; change: number };
    orders: { current: number; previous: number; change: number };
  };
};

const STAGE_COLORS: Record<string, string> = {
  待处理: "#f59e0b",
  已确认: "#3b82f6",
  进行中: "#8b5cf6",
  已完成: "#22c55e",
  已取消: "#ef4444",
};

function ChangeTag({ value }: { value: number }) {
  if (value === 0) return <span className="text-xs text-gray-400">—</span>;
  const up = value > 0;
  return (
    <span className={`text-xs font-medium ${up ? "text-emerald-500" : "text-rose-500"}`}>
      {up ? "↑" : "↓"} {Math.abs(value)}%
    </span>
  );
}

function MiniBar({ data, maxVal }: { data: { label: string; value: number }[]; maxVal: number }) {
  return (
    <div className="flex items-end gap-[3px]" style={{ height: 80 }}>
      {data.map((d, i) => (
        <div key={i} className="flex flex-col items-center flex-1 min-w-0">
          <div
            className="w-full rounded-t"
            style={{
              height: maxVal > 0 ? Math.max(2, (d.value / maxVal) * 68) : 2,
              background: "linear-gradient(180deg, #6366f1, #818cf8)",
              transition: "height 0.3s",
            }}
          />
          <div className="text-[9px] text-gray-400 mt-1 truncate w-full text-center">{d.label}</div>
        </div>
      ))}
    </div>
  );
}

function DonutChart({ data }: { data: { stage: string; count: number }[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) return <div className="text-xs text-gray-400 text-center py-4">暂无数据</div>;

  const pcts = data.map((d) => (d.count / total) * 100);
  const segments = data.map((d, i) => ({
    ...d,
    pct: pcts[i],
    offset: pcts.slice(0, i).reduce((a, b) => a + b, 0),
  }));

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 36 36" className="w-20 h-20">
        {segments.map((s, i) => (
          <circle
            key={i}
            cx="18"
            cy="18"
            r="15.9"
            fill="none"
            stroke={STAGE_COLORS[s.stage] || "#94a3b8"}
            strokeWidth="3"
            strokeDasharray={`${s.pct} ${100 - s.pct}`}
            strokeDashoffset={-s.offset}
            strokeLinecap="round"
          />
        ))}
        <text x="18" y="19" textAnchor="middle" className="text-[6px] fill-gray-600 font-semibold">
          {total}
        </text>
      </svg>
      <div className="flex flex-col gap-1">
        {segments.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: STAGE_COLORS[s.stage] || "#94a3b8" }}
            />
            <span className="text-gray-600">{s.stage}</span>
            <span className="text-gray-400">{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FunnelChart({ data }: { data: { step: string; count: number }[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="flex flex-col gap-2">
      {data.map((d, i) => {
        const widthPct = Math.max(8, (d.count / max) * 100);
        const prev = i > 0 ? data[i - 1].count : 0;
        const rate = prev > 0 ? Math.round((d.count / prev) * 100) : 100;
        return (
          <div key={i} className="flex items-center gap-2">
            <div className="w-16 text-xs text-gray-500 text-right shrink-0">{d.step}</div>
            <div className="flex-1 relative h-6">
              <div
                className="h-full rounded"
                style={{
                  width: `${widthPct}%`,
                  background: `hsl(${240 - i * 30}, 70%, 60%)`,
                  transition: "width 0.3s",
                }}
              />
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-white font-medium">
                {d.count}
              </span>
            </div>
            {i > 0 && <span className="text-[10px] text-gray-400 w-10 shrink-0">{rate}%</span>}
          </div>
        );
      })}
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string>("");

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/dashboard");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setLastUpdate(new Date().toLocaleTimeString());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, 15_000);
    return () => clearInterval(timer);
  }, [fetchData]);

  if (loading && !data) {
    return <div className="p-6 text-center text-gray-400">加载中...</div>;
  }

  if (error && !data) {
    return (
      <div className="p-6 text-center">
        <div className="text-rose-500 mb-2">{error}</div>
        <button className="admin-btn" onClick={fetchData}>
          重试
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { realtime, trends, hourly, distribution, topPlayers, funnel, comparison } = data;
  const maxHourly = Math.max(...hourly.map((h) => h.count), 1);
  const maxTrendOrders = Math.max(...trends.map((t) => t.orders), 1);
  const maxTrendRevenue = Math.max(...trends.map((t) => t.revenue), 1);

  return (
    <div className="admin-page">
      <div className="flex items-center justify-between mb-4">
        <h2 className="admin-title">数据大屏</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">{lastUpdate ? `更新于 ${lastUpdate}` : ""}</span>
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        </div>
      </div>

      {/* Realtime KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="admin-card p-4">
          <div className="text-xs text-gray-400">今日订单</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{realtime.todayOrders}</div>
          <div className="text-xs text-gray-400 mt-1">完成 {realtime.todayCompleted}</div>
        </div>
        <div className="admin-card p-4">
          <div className="text-xs text-gray-400">今日营收</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">
            ¥{realtime.todayRevenue.toFixed(2)}
          </div>
          <div className="mt-1">
            <ChangeTag value={realtime.revenueChange} />
          </div>
        </div>
        <div className="admin-card p-4">
          <div className="text-xs text-gray-400">今日用户</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{realtime.todayUsers}</div>
          <div className="text-xs text-gray-400 mt-1">下单用户</div>
        </div>
        <div className="admin-card p-4">
          <div className="text-xs text-gray-400">服务费</div>
          <div className="text-2xl font-bold text-indigo-600 mt-1">
            ¥{realtime.todayServiceFee.toFixed(2)}
          </div>
          <div className="text-xs text-gray-400 mt-1">平台收入</div>
        </div>
      </div>

      {/* Week-over-week comparison */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="admin-card p-4">
          <div className="text-xs text-gray-400 mb-2">本周 vs 上周 · 营收</div>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold">¥{comparison.revenue.current.toFixed(0)}</span>
            <span className="text-xs text-gray-400">
              ← ¥{comparison.revenue.previous.toFixed(0)}
            </span>
            <ChangeTag value={comparison.revenue.change} />
          </div>
        </div>
        <div className="admin-card p-4">
          <div className="text-xs text-gray-400 mb-2">本周 vs 上周 · 订单</div>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold">{comparison.orders.current}</span>
            <span className="text-xs text-gray-400">← {comparison.orders.previous}</span>
            <ChangeTag value={comparison.orders.change} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* 7-day order trend */}
        <div className="admin-card p-4">
          <div className="text-xs text-gray-400 mb-3">7日订单趋势</div>
          <MiniBar
            data={trends.map((t) => ({ label: t.date.slice(5), value: t.orders }))}
            maxVal={maxTrendOrders}
          />
        </div>

        {/* 7-day revenue trend */}
        <div className="admin-card p-4">
          <div className="text-xs text-gray-400 mb-3">7日营收趋势</div>
          <MiniBar
            data={trends.map((t) => ({ label: t.date.slice(5), value: t.revenue }))}
            maxVal={maxTrendRevenue}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Hourly distribution */}
        <div className="admin-card p-4">
          <div className="text-xs text-gray-400 mb-3">今日24小时订单分布</div>
          <div className="flex items-end gap-[2px]" style={{ height: 60 }}>
            {hourly.map((h) => (
              <div key={h.hour} className="flex-1 min-w-0 flex flex-col items-center">
                <div
                  className="w-full rounded-t"
                  style={{
                    height: maxHourly > 0 ? Math.max(1, (h.count / maxHourly) * 48) : 1,
                    background: h.count > 0 ? "#6366f1" : "#e5e7eb",
                    transition: "height 0.3s",
                  }}
                />
                {h.hour % 4 === 0 && (
                  <div className="text-[8px] text-gray-400 mt-0.5">{h.hour}</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Stage distribution */}
        <div className="admin-card p-4">
          <div className="text-xs text-gray-400 mb-3">订单状态分布</div>
          <DonutChart data={distribution} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Conversion funnel */}
        <div className="admin-card p-4">
          <div className="text-xs text-gray-400 mb-3">今日转化漏斗</div>
          <FunnelChart data={funnel} />
        </div>

        {/* Top players */}
        <div className="admin-card p-4">
          <div className="text-xs text-gray-400 mb-3">今日 TOP5 陪练</div>
          {topPlayers.length === 0 ? (
            <div className="text-xs text-gray-400 text-center py-4">今日暂无接单</div>
          ) : (
            <div className="flex flex-col gap-2">
              {topPlayers.map((p, i) => (
                <div key={p.id} className="flex items-center gap-2">
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${
                      i === 0
                        ? "bg-amber-400"
                        : i === 1
                          ? "bg-gray-400"
                          : i === 2
                            ? "bg-amber-600"
                            : "bg-gray-300"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="text-sm text-gray-700 flex-1 truncate">{p.name}</span>
                  <span className="text-xs text-gray-400">{p.orders}单</span>
                  <span className="text-xs text-emerald-500">¥{p.revenue}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
