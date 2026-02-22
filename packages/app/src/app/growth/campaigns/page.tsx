"use client";

import { useEffect, useState } from "react";

type Campaign = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  budget: number | null;
  spent: number;
  impressions: number;
  clicks: number;
  leads: number;
  orders: number;
  revenue: number;
  startsAt: string | null;
  endsAt: string | null;
  utmCampaign: string | null;
  channel: { code: string; name: string; icon: string | null };
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  active: "bg-emerald-50 text-emerald-600",
  paused: "bg-amber-50 text-amber-600",
  completed: "bg-blue-50 text-blue-600",
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    fetch("/api/growth/campaigns", {
      headers: {
        Authorization: `Bearer ${document.cookie.match(/admin_session=([^;]+)/)?.[1] || ""}`,
      },
    })
      .then((r) => r.json())
      .then(setCampaigns)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-20 text-gray-400">加载中...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">投放活动</h1>
          <p className="text-sm text-gray-500">管理各渠道的投放计划和素材</p>
        </div>
        <button
          className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800"
          onClick={() => setShowCreate(!showCreate)}
        >
          + 新建活动
        </button>
      </div>

      {campaigns.length === 0 ? (
        <div className="bg-white rounded-xl border py-16 text-center">
          <div className="text-4xl mb-3">🚀</div>
          <div className="text-gray-500">还没有投放活动</div>
          <div className="text-sm text-gray-400 mt-1">创建第一个活动，开始追踪获客效果</div>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => (
            <div key={c.id} className="bg-white rounded-xl border p-4 hover:shadow-sm transition">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span>{c.channel.icon || "📡"}</span>
                  <span className="text-xs text-gray-400">{c.channel.name}</span>
                  <span className="text-gray-300">·</span>
                  <span className="font-semibold text-gray-900">{c.name}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLORS[c.status] || "bg-gray-100"}`}
                  >
                    {c.status}
                  </span>
                </div>
                {c.budget && (
                  <div className="text-xs text-gray-500">
                    预算 ¥{c.budget.toLocaleString()} · 已花 ¥{c.spent.toLocaleString()}
                  </div>
                )}
              </div>
              {c.description && <div className="text-xs text-gray-500 mb-3">{c.description}</div>}
              <div className="grid grid-cols-5 gap-4 text-center">
                <div>
                  <div className="text-lg font-bold text-gray-900">{c.impressions}</div>
                  <div className="text-[10px] text-gray-400">曝光</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-gray-900">{c.clicks}</div>
                  <div className="text-[10px] text-gray-400">点击</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-gray-900">{c.leads}</div>
                  <div className="text-[10px] text-gray-400">线索</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-emerald-600">{c.orders}</div>
                  <div className="text-[10px] text-gray-400">下单</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-emerald-600">¥{c.revenue.toFixed(0)}</div>
                  <div className="text-[10px] text-gray-400">营收</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
