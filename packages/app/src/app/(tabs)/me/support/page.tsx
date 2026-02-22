"use client";

import Link from "next/link";
import { ArrowLeft, Headset, MessageCircle, Send, Clock3 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PASSKEY_STORAGE_KEY } from "@/app/components/passkey-wallet";
import { StateBlock } from "@/app/components/state-block";
import { formatFullDateTime } from "@/lib/shared/date-utils";

const STORAGE_KEY = "qy_support_requests_v1";

type SupportRequest = {
  id: string;
  topic: string;
  message: string;
  contact?: string;
  status: string;
  createdAt: number;
};

const topics = ["订单问题", "支付问题", "账号与安全", "陪练服务", "其他"];

const channels = [
  { label: "在线客服", value: "企业微信：qy-esports", hint: "09:00-24:00" },
  { label: "客服电话", value: "400-882-1001", hint: "紧急问题优先" },
  { label: "反馈邮箱", value: "support@qingyi.gg", hint: "1 个工作日内回复" },
];

function loadLocalRequests(): SupportRequest[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SupportRequest[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistLocalRequests(list: SupportRequest[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 5)));
}

export default function SupportPage() {
  const [form, setForm] = useState({
    name: "",
    contact: "",
    topic: topics[0],
    message: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [requests, setRequests] = useState<SupportRequest[]>([]);

  const walletAddress = useMemo(() => {
    if (typeof window === "undefined") return "";
    try {
      const raw = localStorage.getItem(PASSKEY_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as { address?: string }).address || "" : "";
    } catch {
      return "";
    }
  }, []);

  useEffect(() => {
    setRequests(loadLocalRequests());
  }, []);

  const submit = async () => {
    if (!form.message.trim()) {
      setHint("form.description_required");
      return;
    }
    setSubmitting(true);
    setHint(null);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          contact: form.contact.trim(),
          topic: form.topic,
          message: form.message.trim(),
          userAddress: walletAddress,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setHint(data?.error || "提交失败，请稍后重试");
        return;
      }
      const next: SupportRequest = {
        id: data?.id || `SUP-${Date.now()}`,
        topic: form.topic,
        message: form.message.trim(),
        contact: form.contact.trim() || undefined,
        status: "待处理",
        createdAt: Date.now(),
      };
      const updated = [next, ...requests];
      setRequests(updated);
      persistLocalRequests(updated);
      setForm((prev) => ({ ...prev, message: "" }));
      setHint("apply.support_ticket_submitted");
    } catch {
      setHint("error.network");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dl-main">
      <header className="dl-topbar">
        <div className="dl-time">
          <Link href="/me" className="dl-icon-circle" aria-label="返回我的">
            <ArrowLeft size={16} />
          </Link>
          <span className="dl-time-text">联系客服</span>
          <span className="dl-chip">实时支持</span>
        </div>
        <div className="dl-actions">
          <span className="dl-icon-circle">
            <Headset size={16} />
          </span>
        </div>
      </header>

      <section className="dl-card" style={{ padding: 16 }}>
        <div className="text-sm font-semibold text-gray-900">联系通道</div>
        <div className="mt-3 grid gap-3">
          {channels.map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-[0_10px_30px_rgba(15,23,42,0.06)]"
            >
              <div>
                <div className="text-sm font-semibold text-gray-900">{item.label}</div>
                <div className="text-xs text-gray-500 mt-1">{item.value}</div>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Clock3 size={14} />
                {item.hint}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 text-xs text-slate-500">
          紧急问题可直接拨打客服电话，其他问题建议提交工单。
        </div>
      </section>

      <section className="dl-card" style={{ padding: 16 }}>
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-900">问题反馈</div>
          <span className="text-xs text-slate-500">24 小时内响应</span>
        </div>
        <div className="mt-3 grid gap-3">
          <div className="grid gap-2">
            <label className="text-xs text-slate-500">称呼</label>
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
              placeholder="如：糕手玩玩"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-xs text-slate-500">联系方式</label>
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
              placeholder="微信 / 手机 / 邮箱"
              value={form.contact}
              onChange={(event) => setForm((prev) => ({ ...prev, contact: event.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-xs text-slate-500">问题类型</label>
            <div className="flex flex-wrap gap-2">
              {topics.map((topic) => (
                <button
                  type="button"
                  key={topic}
                  onClick={() => setForm((prev) => ({ ...prev, topic }))}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                    form.topic === topic
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  {topic}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-2">
            <label className="text-xs text-slate-500">问题描述</label>
            <textarea
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm min-h-[120px]"
              placeholder="请尽量详细描述，我们将更快定位问题"
              value={form.message}
              onChange={(event) => setForm((prev) => ({ ...prev, message: event.target.value }))}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="mt-4 w-full rounded-2xl bg-slate-900 text-white py-2 text-sm font-semibold flex items-center justify-center gap-2"
        >
          <Send size={16} />
          {submitting ? "提交中..." : "提交工单"}
        </button>
        {hint && <div className="mt-3 text-xs text-amber-600">{hint}</div>}
      </section>

      <section className="dl-card" style={{ padding: 16 }}>
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-900">最近反馈</div>
          <MessageCircle size={16} className="text-slate-500" />
        </div>
        {requests.length === 0 ? (
          <div className="mt-3">
            <StateBlock
              tone="empty"
              size="compact"
              title="暂无记录"
              description="提交工单后会在这里显示"
            />
          </div>
        ) : (
          <div className="mt-3 grid gap-3">
            {requests.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-[0_10px_30px_rgba(15,23,42,0.06)]"
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-gray-900">{item.topic}</div>
                  <span className="text-xs text-emerald-600">{item.status}</span>
                </div>
                <div className="text-xs text-slate-500 mt-2">{item.message}</div>
                <div className="text-[11px] text-slate-400 mt-2">
                  {formatFullDateTime(item.createdAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
