"use client";

import { useEffect, useState } from "react";

type Path = {
  contactId: string;
  name: string | null;
  convertedAt: string | null;
  totalSpent: number;
  path: Array<{ channel: string; type: string; time: string; campaign: string | null }>;
};

export default function AttributionPage() {
  const [paths, setPaths] = useState<Path[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/growth/dashboard?days=90", {
      headers: {
        Authorization: `Bearer ${document.cookie.match(/admin_session=([^;]+)/)?.[1] || ""}`,
      },
    })
      .then((r) => r.json())
      .then((d) => setPaths(d.paths || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-20 text-gray-400">加载中...</div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">归因分析</h1>
        <p className="text-sm text-gray-500">查看用户从首次接触到下单的完整路径</p>
      </div>

      {paths.length === 0 ? (
        <div className="bg-white rounded-xl border py-16 text-center">
          <div className="text-4xl mb-3">🔍</div>
          <div className="text-gray-500">暂无转化路径数据</div>
          <div className="text-sm text-gray-400 mt-1">用户完成首单后，转化路径会显示在这里</div>
        </div>
      ) : (
        <div className="space-y-3">
          {paths.map((p) => (
            <div key={p.contactId} className="bg-white rounded-xl border p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">{p.name || "匿名用户"}</span>
                  <span className="text-xs text-gray-400">
                    {p.convertedAt ? new Date(p.convertedAt).toLocaleDateString() : ""}
                  </span>
                </div>
                <span className="text-sm font-bold text-emerald-600">
                  ¥{p.totalSpent.toFixed(0)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {p.path.map((step, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    {i > 0 && <span className="text-gray-300 text-xs">→</span>}
                    <div
                      className={`px-2 py-1 rounded-lg text-xs ${
                        step.type === "order"
                          ? "bg-emerald-50 text-emerald-700 font-medium"
                          : step.type === "register"
                            ? "bg-blue-50 text-blue-700"
                            : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      <div>{step.channel}</div>
                      <div className="text-[9px] opacity-70">{step.type}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
