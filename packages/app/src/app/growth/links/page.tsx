"use client";

import { useEffect, useState } from "react";

type Channel = { id: string; code: string; name: string; icon: string | null };
type Campaign = { id: string; name: string; channel: { code: string; name: string } };

export default function LinksPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [form, setForm] = useState({
    channelCode: "douyin",
    campaignId: "",
    utmMedium: "social",
    utmContent: "",
    redirect: "/home",
  });
  const [generatedUrl, setGeneratedUrl] = useState("");

  useEffect(() => {
    fetch("/api/growth/channels", {
      headers: {
        Authorization: `Bearer ${document.cookie.match(/admin_session=([^;]+)/)?.[1] || ""}`,
      },
    })
      .then((r) => r.json())
      .then(setChannels)
      .catch(console.error);

    fetch("/api/growth/campaigns", {
      headers: {
        Authorization: `Bearer ${document.cookie.match(/admin_session=([^;]+)/)?.[1] || ""}`,
      },
    })
      .then((r) => r.json())
      .then(setCampaigns)
      .catch(console.error);
  }, []);

  const generate = () => {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    const params = new URLSearchParams();
    params.set("utm_source", form.channelCode);
    params.set("utm_medium", form.utmMedium);
    if (form.campaignId) {
      const camp = campaigns.find((c) => c.id === form.campaignId);
      if (camp) params.set("utm_campaign", camp.name.replace(/\s+/g, "_"));
    }
    if (form.utmContent) params.set("utm_content", form.utmContent);
    params.set("redirect", form.redirect);
    setGeneratedUrl(`${base}/api/growth/track?${params.toString()}`);
  };

  const copy = () => {
    navigator.clipboard.writeText(generatedUrl);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">推广链接生成器</h1>
        <p className="text-sm text-gray-500">为各渠道生成带追踪参数的推广链接</p>
      </div>

      <div className="bg-white rounded-xl border p-5 max-w-xl">
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-600 mb-1">渠道</label>
            <select
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              value={form.channelCode}
              onChange={(e) => setForm((f) => ({ ...f, channelCode: e.target.value }))}
            >
              {channels.map((ch) => (
                <option key={ch.code} value={ch.code}>
                  {ch.icon} {ch.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">关联活动（可选）</label>
            <select
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              value={form.campaignId}
              onChange={(e) => setForm((f) => ({ ...f, campaignId: e.target.value }))}
            >
              <option value="">不关联</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.channel.name} · {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">媒介类型</label>
            <select
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              value={form.utmMedium}
              onChange={(e) => setForm((f) => ({ ...f, utmMedium: e.target.value }))}
            >
              <option value="social">社交媒体</option>
              <option value="video">视频</option>
              <option value="live">直播</option>
              <option value="post">帖子/笔记</option>
              <option value="comment">评论区</option>
              <option value="dm">私信</option>
              <option value="ad">付费广告</option>
              <option value="qrcode">二维码</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">素材标识（可选）</label>
            <input
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              placeholder="如：教学视频01、直播间链接..."
              value={form.utmContent}
              onChange={(e) => setForm((f) => ({ ...f, utmContent: e.target.value }))}
            />
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">落地页</label>
            <select
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              value={form.redirect}
              onChange={(e) => setForm((f) => ({ ...f, redirect: e.target.value }))}
            >
              <option value="/home">首页</option>
              <option value="/pricing">定价页</option>
              <option value="/faq">FAQ</option>
              <option value="/schedule">大厅</option>
            </select>
          </div>

          <button
            className="w-full py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800"
            onClick={generate}
          >
            生成推广链接
          </button>
        </div>

        {generatedUrl && (
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <div className="text-[10px] text-gray-500 mb-1">推广链接</div>
            <div className="text-xs text-gray-800 break-all font-mono">{generatedUrl}</div>
            <button
              className="mt-2 px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
              onClick={copy}
            >
              复制链接
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
