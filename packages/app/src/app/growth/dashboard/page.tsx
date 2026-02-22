"use client";

import { useEffect, useState } from "react";

type DashboardData = {
  stats: {
    totalContacts: number;
    newContacts: number;
    totalTouchpoints: number;
    recentConversions: number;
    channelBreakdown: Array<{ channel: string; count: number }>;
    lifecycle: Record<string, number>;
  };
  channels: Array<{
    code: string;
    name: string;
    icon: string | null;
    color: string | null;
    visits: number;
    registers: number;
    orders: number;
    revenue: number;
    conversionRate: string;
    cpa: string | null;
  }>;
  paths: Array<{
    contactId: string;
    name: string | null;
    convertedAt: string | null;
    totalSpent: number;
    path: Array<{ channel: string; type: string; time: string }>;
  }>;
};

const LIFECYCLE_LABELS: Record<string, { label: string; color: string }> = {
  stranger: { label: "陌生人", color: "bg-gray-100 text-gray-600" },
  visitor: { label: "访客", color: "bg-blue-50 text-blue-600" },
  lead: { label: "线索", color: "bg-amber-50 text-amber-600" },
  customer: { label: "客户", color: "bg-emerald-50 text-emerald-600" },
  promoter: { label: "推广者", color: "bg-purple-50 text-purple-600" },
};

const PERIOD_OPTIONS = [
  { label: "7 天", value: 7 },
  { label: "14 天", value: 14 },
  { label: "30 天", value: 30 },
  { label: "90 天", value: 90 },
];

export default function GrowthDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(`/api/growth/dashboard?days=${days}`, {
          headers: {
            Authorization: `Bearer ${document.cookie.match(/admin_session=([^;]+)/)?.[1] || ""}`,
          },
        });
        const d = await r.json();
        if (!cancelled) {
          setData(d);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [days]);

  if (loading) return <div className="text-center py-20 text-gray-400">加载中...</div>;
  if (!data) return <div className="text-center py-20 text-gray-400">加载失败</div>;

  const { stats, channels } = data;
  const totalLifecycle = Object.values(stats.lifecycle).reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">流量总览</h1>
          <p className="text-sm text-gray-500 mt-0.5">全渠道获客数据一览</p>
        </div>
        <div className="flex gap-1 bg-white rounded-lg border p-0.5">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`px-3 py-1 text-xs rounded-md transition ${days === opt.value ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-50"}`}
              onClick={() => setDays(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="总用户" value={stats.totalContacts} />
        <KpiCard label={`新增 (${days}天)`} value={stats.newContacts} />
        <KpiCard label="触点事件" value={stats.totalTouchpoints} />
        <KpiCard label="新转化" value={stats.recentConversions} accent />
      </div>

      {/* Lifecycle Funnel */}
      <div className="bg-white rounded-xl border p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">用户生命周期分布</h2>
        <div className="flex gap-2">
          {Object.entries(LIFECYCLE_LABELS).map(([key, { label, color }]) => {
            const count = stats.lifecycle[key] || 0;
            const pct = ((count / totalLifecycle) * 100).toFixed(1);
            return (
              <div key={key} className="flex-1 text-center">
                <div className={`rounded-lg py-3 ${color}`}>
                  <div className="text-lg font-bold">{count}</div>
                  <div className="text-[10px] mt-0.5">{label}</div>
                </div>
                <div className="text-[10px] text-gray-400 mt-1">{pct}%</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Channel Performance Table */}
      <div className="bg-white rounded-xl border p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">渠道表现</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b">
                <th className="pb-2 font-medium">渠道</th>
                <th className="pb-2 font-medium text-right">访问</th>
                <th className="pb-2 font-medium text-right">注册</th>
                <th className="pb-2 font-medium text-right">下单</th>
                <th className="pb-2 font-medium text-right">营收</th>
                <th className="pb-2 font-medium text-right">转化率</th>
                <th className="pb-2 font-medium text-right">CPA</th>
              </tr>
            </thead>
            <tbody>
              {channels
                .filter((ch) => ch.visits > 0 || ch.orders > 0)
                .sort((a, b) => b.orders - a.orders)
                .map((ch) => (
                  <tr key={ch.code} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2.5">
                      <span className="mr-1.5">{ch.icon}</span>
                      {ch.name}
                    </td>
                    <td className="py-2.5 text-right text-gray-600">{ch.visits}</td>
                    <td className="py-2.5 text-right text-gray-600">{ch.registers}</td>
                    <td className="py-2.5 text-right font-medium">{ch.orders}</td>
                    <td className="py-2.5 text-right text-emerald-600">¥{ch.revenue.toFixed(0)}</td>
                    <td className="py-2.5 text-right text-gray-600">{ch.conversionRate}%</td>
                    <td className="py-2.5 text-right text-gray-400">
                      {ch.cpa ? `¥${ch.cpa}` : "-"}
                    </td>
                  </tr>
                ))}
              {channels.filter((ch) => ch.visits > 0 || ch.orders > 0).length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-400">
                    暂无数据，开始投放后这里会显示各渠道表现
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Conversion Paths */}
      {data.paths.length > 0 && (
        <div className="bg-white rounded-xl border p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">最近转化路径</h2>
          <div className="space-y-3">
            {data.paths.slice(0, 5).map((p) => (
              <div key={p.contactId} className="flex items-center gap-3 text-xs">
                <span className="text-gray-500 w-20 shrink-0">{p.name || "匿名"}</span>
                <div className="flex items-center gap-1 flex-1 overflow-x-auto">
                  {p.path.map((step, i) => (
                    <span key={i} className="flex items-center gap-1">
                      {i > 0 && <span className="text-gray-300">→</span>}
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] ${step.type === "order" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}
                      >
                        {step.channel}:{step.type}
                      </span>
                    </span>
                  ))}
                </div>
                <span className="text-emerald-600 font-medium shrink-0">
                  ¥{p.totalSpent.toFixed(0)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="bg-white rounded-xl border p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${accent ? "text-emerald-600" : "text-gray-900"}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}
