"use client";
import { t } from "@/lib/i18n/t";

import Link from "next/link";
import { ArrowLeft, Headset, MessageCircle, Send, Clock3, ImagePlus, X } from "lucide-react";
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
  reply?: string;
  createdAt: number;
};

const topics = [
  t("ui.support.668"),
  t("ui.support.619"),
  t("ui.support.685"),
  t("ui.support.696"),
  t("ui.support.542"),
];

const channels = [
  { label: t("ui.support.565"), value: t("ui.support.515"), hint: "09:00-24:00" },
  { label: t("ui.support.574"), value: "400-882-1001", hint: t("ui.support.644") },
  { label: t("ui.support.559"), value: "support@qingyi.gg", hint: t("ui.support.503") },
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
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [agreed, setAgreed] = useState(false);

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
    const local = loadLocalRequests();
    setRequests(local);
    if (walletAddress) {
      fetch(`/api/support/my-tickets?address=${encodeURIComponent(walletAddress)}`)
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data?.items)) {
            setRequests(data.items);
          }
        })
        .catch(() => {});
    }
  }, [walletAddress]);

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
          screenshots: screenshots.length ? screenshots : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setHint(data?.error || t("tabs.me.support.i095"));
        return;
      }
      const next: SupportRequest = {
        id: data?.id || `SUP-${Date.now()}`,
        topic: form.topic,
        message: form.message.trim(),
        contact: form.contact.trim() || undefined,
        status: t("tabs.me.support.i039"),
        createdAt: Date.now(),
      };
      const updated = [next, ...requests];
      setRequests(updated);
      persistLocalRequests(updated);
      setForm((prev) => ({ ...prev, message: "" }));
      setScreenshots([]);
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
          <Link href="/me" className="dl-icon-circle" aria-label={t("me.support.001")}>
            <ArrowLeft size={16} />
          </Link>
          <span className="dl-time-text">{t("ui.support.078")}</span>
          <span className="dl-chip">{t("ui.support.079")}</span>
        </div>
        <div className="dl-actions">
          <span className="dl-icon-circle">
            <Headset size={16} />
          </span>
        </div>
      </header>

      <section className="dl-card" style={{ padding: 16 }}>
        <div className="text-sm font-semibold text-gray-900">{t("ui.support.080")}</div>
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
          <div className="text-sm font-semibold text-gray-900">{t("ui.support.081")}</div>
          <span className="text-xs text-slate-500">{t("ui.support.082")}</span>
        </div>
        <div className="mt-3 grid gap-3">
          <div className="grid gap-2">
            <label className="text-xs text-slate-500">{t("ui.support.083")}</label>
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
              placeholder={t("me.support.002")}
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-xs text-slate-500">{t("ui.support.084")}</label>
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
              placeholder={t("me.support.003")}
              value={form.contact}
              onChange={(event) => setForm((prev) => ({ ...prev, contact: event.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-xs text-slate-500">{t("ui.support.085")}</label>
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
            <label className="text-xs text-slate-500">{t("ui.support.086")}</label>
            <textarea
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm min-h-[120px]"
              placeholder={t("me.support.004")}
              value={form.message}
              onChange={(event) => setForm((prev) => ({ ...prev, message: event.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-xs text-slate-500">{t("me.support.010")}</label>
            <div className="flex flex-wrap gap-2">
              {screenshots.map((src, i) => (
                <div
                  key={i}
                  className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-200"
                >
                  <img src={src} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setScreenshots((prev) => prev.filter((_, idx) => idx !== i))}
                    className="absolute top-0.5 right-0.5 bg-black/50 text-white rounded-full p-0.5"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              {screenshots.length < 3 && (
                <label className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center cursor-pointer hover:border-slate-400">
                  <ImagePlus size={20} className="text-slate-400" />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      if (file.size > 500 * 1024) {
                        setHint(t("me.support.011"));
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = () => {
                        const base64 = reader.result as string;
                        setScreenshots((prev) => [...prev, base64]);
                      };
                      reader.readAsDataURL(file);
                      event.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>
          </div>
        </div>
        <label className="mt-3 flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(event) => setAgreed(event.target.checked)}
            className="rounded border-slate-300"
          />
          <span>
            {t("me.support.008")}
            <a href="/terms" target="_blank" className="text-blue-600 underline">
              {t("me.support.009")}
            </a>
          </span>
        </label>
        <button
          type="button"
          onClick={submit}
          disabled={submitting || !agreed}
          className="mt-4 w-full rounded-2xl bg-slate-900 text-white py-2 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Send size={16} />
          {submitting ? t("ui.support.606") : t("me.support.005")}
        </button>
        {hint && <div className="mt-3 text-xs text-amber-600">{hint}</div>}
      </section>

      <section className="dl-card" style={{ padding: 16 }}>
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-900">{t("ui.support.087")}</div>
          <MessageCircle size={16} className="text-slate-500" />
        </div>
        {requests.length === 0 ? (
          <div className="mt-3">
            <StateBlock
              tone="empty"
              size="compact"
              title={t("me.support.006")}
              description={t("me.support.007")}
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
                {item.reply && (
                  <div className="mt-2 rounded-xl bg-blue-50 px-3 py-2">
                    <div className="text-[11px] text-blue-600 font-semibold">
                      {t("me.support.013")}
                    </div>
                    <div className="text-xs text-blue-800 mt-1">{item.reply}</div>
                  </div>
                )}
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
