"use client";

import { useEffect, useState } from "react";

type Touchpoint = {
  id: string;
  channelCode: string;
  touchType: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  landingPage: string | null;
  deviceType: string | null;
  orderId: string | null;
  orderAmount: number | null;
  createdAt: string;
};

type FollowUp = {
  id: string;
  action: string;
  content: string | null;
  result: string | null;
  operatorId: string;
  createdAt: string;
};

type ContactDetail = {
  id: string;
  userAddress: string | null;
  phone: string | null;
  wechat: string | null;
  name: string | null;
  source: string | null;
  lifecycle: string;
  score: number;
  tags: string[];
  totalOrders: number;
  totalSpent: number;
  firstSeenAt: string;
  lastSeenAt: string;
  convertedAt: string | null;
  assignedTo: string | null;
  notes: string | null;
  touchpoints: Touchpoint[];
  followUps: FollowUp[];
};

const LIFECYCLE_COLORS: Record<string, string> = {
  stranger: "bg-gray-100 text-gray-600",
  visitor: "bg-blue-50 text-blue-600",
  lead: "bg-amber-50 text-amber-600",
  customer: "bg-emerald-50 text-emerald-600",
  promoter: "bg-purple-50 text-purple-600",
};

const TOUCH_ICONS: Record<string, string> = {
  visit: "👁️",
  click: "👆",
  register: "📝",
  order: "💰",
  referral: "🤝",
  return: "🔄",
};

const ACTION_LABELS: Record<string, string> = {
  call: "📞 电话",
  wechat: "💬 微信",
  sms: "📱 短信",
  note: "📝 备注",
  status_change: "🔄 状态变更",
};

export default function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [contact, setContact] = useState<ContactDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [followUpForm, setFollowUpForm] = useState({ action: "note", content: "", result: "" });
  const [submitting, setSubmitting] = useState(false);
  const [contactId, setContactId] = useState("");

  useEffect(() => {
    params.then(({ id }) => {
      setContactId(id);
      fetch(`/api/growth/contacts/${id}`, {
        headers: {
          Authorization: `Bearer ${document.cookie.match(/admin_session=([^;]+)/)?.[1] || ""}`,
        },
      })
        .then((r) => r.json())
        .then((d) => {
          setContact(d);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    });
  }, [params]);

  const submitFollowUp = async () => {
    if (!contactId || !followUpForm.content) return;
    setSubmitting(true);
    try {
      await fetch(`/api/growth/contacts/${contactId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${document.cookie.match(/admin_session=([^;]+)/)?.[1] || ""}`,
        },
        body: JSON.stringify(followUpForm),
      });
      // Refresh
      const r = await fetch(`/api/growth/contacts/${contactId}`, {
        headers: {
          Authorization: `Bearer ${document.cookie.match(/admin_session=([^;]+)/)?.[1] || ""}`,
        },
      });
      setContact(await r.json());
      setFollowUpForm({ action: "note", content: "", result: "" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="text-center py-20 text-gray-400">加载中...</div>;
  if (!contact) return <div className="text-center py-20 text-gray-400">用户不存在</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <a href="/growth/contacts" className="text-xs text-gray-400 hover:text-gray-600">
            ← 返回用户池
          </a>
          <h1 className="text-xl font-bold text-gray-900 mt-1">{contact.name || "匿名用户"}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${LIFECYCLE_COLORS[contact.lifecycle] || "bg-gray-100"}`}
            >
              {contact.lifecycle}
            </span>
            <span className="text-xs text-gray-400">评分: {contact.score}</span>
            {contact.assignedTo && (
              <span className="text-xs text-gray-400">负责人: {contact.assignedTo}</span>
            )}
          </div>
        </div>
        <div className="text-right text-xs text-gray-400">
          <div>首次: {new Date(contact.firstSeenAt).toLocaleDateString()}</div>
          <div>最近: {new Date(contact.lastSeenAt).toLocaleDateString()}</div>
          {contact.convertedAt && (
            <div className="text-emerald-600">
              转化: {new Date(contact.convertedAt).toLocaleDateString()}
            </div>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <div className="text-xs text-gray-500">来源渠道</div>
          <div className="text-lg font-bold mt-1">{contact.source || "未知"}</div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="text-xs text-gray-500">触点次数</div>
          <div className="text-lg font-bold mt-1">{contact.touchpoints.length}</div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="text-xs text-gray-500">订单数</div>
          <div className="text-lg font-bold mt-1">{contact.totalOrders}</div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="text-xs text-gray-500">累计消费</div>
          <div className="text-lg font-bold text-emerald-600 mt-1">
            ¥{contact.totalSpent.toFixed(0)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Journey Timeline */}
        <div className="bg-white rounded-xl border p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">用户旅程</h2>
          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {contact.touchpoints.map((tp) => (
              <div key={tp.id} className="flex items-start gap-3">
                <div className="text-lg mt-0.5">{TOUCH_ICONS[tp.touchType] || "📌"}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{tp.channelCode}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] ${tp.touchType === "order" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}
                    >
                      {tp.touchType}
                    </span>
                    {tp.orderAmount && (
                      <span className="text-xs text-emerald-600 font-medium">
                        ¥{tp.orderAmount}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5">
                    {new Date(tp.createdAt).toLocaleString()}
                    {tp.utmMedium && ` · ${tp.utmMedium}`}
                    {tp.landingPage && ` · ${tp.landingPage}`}
                    {tp.deviceType && ` · ${tp.deviceType}`}
                  </div>
                </div>
              </div>
            ))}
            {contact.touchpoints.length === 0 && (
              <div className="text-center text-gray-400 text-sm py-4">暂无触点记录</div>
            )}
          </div>
        </div>

        {/* Follow-ups */}
        <div className="bg-white rounded-xl border p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">跟进记录</h2>

          {/* Add follow-up form */}
          <div className="border rounded-lg p-3 mb-4 bg-gray-50">
            <div className="flex gap-2 mb-2">
              <select
                className="rounded border px-2 py-1 text-xs"
                value={followUpForm.action}
                onChange={(e) => setFollowUpForm((f) => ({ ...f, action: e.target.value }))}
              >
                {Object.entries(ACTION_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <select
                className="rounded border px-2 py-1 text-xs"
                value={followUpForm.result}
                onChange={(e) => setFollowUpForm((f) => ({ ...f, result: e.target.value }))}
              >
                <option value="">结果...</option>
                <option value="interested">有意向</option>
                <option value="not_interested">无意向</option>
                <option value="no_answer">未接通</option>
                <option value="converted">已转化</option>
                <option value="follow_later">稍后跟进</option>
              </select>
            </div>
            <textarea
              className="w-full rounded border px-2 py-1 text-xs resize-none"
              rows={2}
              placeholder="跟进内容..."
              value={followUpForm.content}
              onChange={(e) => setFollowUpForm((f) => ({ ...f, content: e.target.value }))}
            />
            <button
              className="mt-2 px-3 py-1 text-xs bg-gray-900 text-white rounded hover:bg-gray-800 disabled:opacity-50"
              onClick={submitFollowUp}
              disabled={submitting || !followUpForm.content}
            >
              {submitting ? "提交中..." : "添加记录"}
            </button>
          </div>

          <div className="space-y-3 max-h-[350px] overflow-y-auto">
            {contact.followUps.map((fu) => (
              <div key={fu.id} className="border-l-2 border-gray-200 pl-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">
                    {ACTION_LABELS[fu.action] || fu.action}
                  </span>
                  {fu.result && (
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] ${
                        fu.result === "converted"
                          ? "bg-emerald-50 text-emerald-700"
                          : fu.result === "interested"
                            ? "bg-blue-50 text-blue-700"
                            : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {fu.result}
                    </span>
                  )}
                </div>
                {fu.content && <div className="text-xs text-gray-600 mt-0.5">{fu.content}</div>}
                <div className="text-[10px] text-gray-400 mt-0.5">
                  {fu.operatorId} · {new Date(fu.createdAt).toLocaleString()}
                </div>
              </div>
            ))}
            {contact.followUps.length === 0 && (
              <div className="text-center text-gray-400 text-sm py-4">暂无跟进记录</div>
            )}
          </div>
        </div>
      </div>

      {/* Contact Info */}
      <div className="bg-white rounded-xl border p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">联系信息</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-xs text-gray-400">钱包地址</div>
            <div className="text-gray-700 truncate">{contact.userAddress || "-"}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400">手机</div>
            <div className="text-gray-700">{contact.phone || "-"}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400">微信</div>
            <div className="text-gray-700">{contact.wechat || "-"}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400">标签</div>
            <div className="flex gap-1 flex-wrap">
              {contact.tags.length > 0 ? (
                contact.tags.map((tag) => (
                  <span key={tag} className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px]">
                    {tag}
                  </span>
                ))
              ) : (
                <span className="text-gray-400">-</span>
              )}
            </div>
          </div>
        </div>
        {contact.notes && (
          <div className="mt-3 text-xs text-gray-500 border-t pt-3">{contact.notes}</div>
        )}
      </div>
    </div>
  );
}
