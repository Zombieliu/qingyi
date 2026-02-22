"use client";

import { useEffect, useState } from "react";

type Channel = {
  id: string;
  code: string;
  name: string;
  icon: string | null;
  color: string | null;
  active: boolean;
  monthlyBudget: number | null;
  campaigns: Array<{ id: string; name: string; status: string }>;
};

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/growth/channels", {
      headers: {
        Authorization: `Bearer ${document.cookie.match(/admin_session=([^;]+)/)?.[1] || ""}`,
      },
    })
      .then((r) => r.json())
      .then(setChannels)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-20 text-gray-400">加载中...</div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">渠道管理</h1>
        <p className="text-sm text-gray-500">配置和管理所有获客渠道</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {channels.map((ch) => (
          <div key={ch.id} className="bg-white rounded-xl border p-4 hover:shadow-sm transition">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">{ch.icon || "📡"}</span>
              <div>
                <div className="font-semibold text-gray-900">{ch.name}</div>
                <div className="text-[10px] text-gray-400">{ch.code}</div>
              </div>
            </div>
            {ch.monthlyBudget && (
              <div className="text-xs text-gray-500 mb-2">
                月预算:{" "}
                <span className="font-medium text-gray-700">
                  ¥{ch.monthlyBudget.toLocaleString()}
                </span>
              </div>
            )}
            <div className="text-xs text-gray-500">
              {ch.campaigns.length > 0 ? (
                <span className="text-blue-600">{ch.campaigns.length} 个活跃活动</span>
              ) : (
                <span className="text-gray-400">暂无活动</span>
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <a
                href={`/growth/campaigns?channelId=${ch.id}`}
                className="text-[10px] px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200"
              >
                查看活动
              </a>
              <a
                href={`/growth/links?channel=${ch.code}`}
                className="text-[10px] px-2 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100"
              >
                生成链接
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
