"use client";
import { t } from "@/lib/i18n/t";

import Link from "next/link";
import { ArrowLeft, BadgeCheck, ImagePlus, Send, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PASSKEY_STORAGE_KEY } from "@/app/components/passkey-wallet";
import { StateBlock } from "@/app/components/state-block";
import { fetchWithUserAuth } from "@/lib/auth/user-auth-client";
import { formatFullDateTime } from "@/lib/shared/date-utils";

const STORAGE_KEY = "qy_examiner_applications_v1";

type ExaminerApplication = {
  id: string;
  name: string;
  status: string;
  createdAt: number;
};

function loadLocalApplications(): ExaminerApplication[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ExaminerApplication[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistLocalApplications(list: ExaminerApplication[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 5)));
}

export default function ExaminerPage() {
  const [form, setForm] = useState({
    name: "",
    contact: "",
    games: "",
    rank: "",
    liveTime: "",
    note: "",
  });
  const [attachments, setAttachments] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [applications, setApplications] = useState<ExaminerApplication[]>([]);

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
    setApplications(loadLocalApplications());
  }, []);

  const submit = async () => {
    if (!form.name.trim() || !form.contact.trim()) {
      setHint(t("me.examiner.012"));
      return;
    }
    if (!walletAddress) {
      setHint(t("auth.login_before_apply"));
      return;
    }
    setSubmitting(true);
    setHint(null);
    try {
      const res = await fetchWithUserAuth(
        "/api/examiners",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name.trim(),
            contact: form.contact.trim(),
            games: form.games.trim(),
            rank: form.rank.trim(),
            liveTime: form.liveTime.trim(),
            note: form.note.trim(),
            attachments: attachments.length ? attachments : undefined,
            userAddress: walletAddress,
          }),
        },
        walletAddress
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setHint(data?.error || t("tabs.me.examiner.i031"));
        return;
      }
      const next: ExaminerApplication = {
        id: data?.id || `EXA-${Date.now()}`,
        name: form.name.trim(),
        status: t("tabs.me.examiner.i037"),
        createdAt: Date.now(),
      };
      const updated = [next, ...applications];
      setApplications(updated);
      persistLocalApplications(updated);
      setHint(t("apply.examiner_submitted"));
      setForm((prev) => ({ ...prev, note: "" }));
      setAttachments([]);
    } catch {
      setHint(t("error.network"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dl-main">
      <header className="dl-topbar">
        <div className="dl-time">
          <Link href="/me" className="dl-icon-circle" aria-label={t("me.examiner.001")}>
            <ArrowLeft size={16} />
          </Link>
          <span className="dl-time-text">{t("ui.examiner.101")}</span>
          <span className="dl-chip">{t("ui.examiner.102")}</span>
        </div>
        <div className="dl-actions">
          <span className="dl-icon-circle">
            <BadgeCheck size={16} />
          </span>
        </div>
      </header>

      <section className="dl-card" style={{ padding: 16 }}>
        <div className="text-sm font-semibold text-gray-900">{t("ui.examiner.103")}</div>
        <div className="mt-2 text-xs text-slate-500 space-y-2">
          <div>{t("ui.examiner.104")}</div>
          <div>{t("ui.examiner.105")}</div>
          <div>{t("ui.examiner.106")}</div>
        </div>
      </section>

      <section className="dl-card" style={{ padding: 16 }}>
        <div className="text-sm font-semibold text-gray-900">{t("ui.examiner.107")}</div>
        <div className="mt-3 grid gap-3">
          <div className="grid gap-2">
            <label className="text-xs text-slate-500">{t("ui.examiner.108")}</label>
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
              placeholder={t("me.examiner.002")}
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-xs text-slate-500">{t("ui.examiner.109")}</label>
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
              placeholder={t("me.examiner.003")}
              value={form.contact}
              onChange={(event) => setForm((prev) => ({ ...prev, contact: event.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-xs text-slate-500">{t("ui.examiner.110")}</label>
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
              placeholder={t("me.examiner.004")}
              value={form.games}
              onChange={(event) => setForm((prev) => ({ ...prev, games: event.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-xs text-slate-500">{t("ui.examiner.111")}</label>
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
              placeholder={t("me.examiner.005")}
              value={form.rank}
              onChange={(event) => setForm((prev) => ({ ...prev, rank: event.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-xs text-slate-500">{t("ui.examiner.112")}</label>
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
              placeholder={t("me.examiner.006")}
              value={form.liveTime}
              onChange={(event) => setForm((prev) => ({ ...prev, liveTime: event.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-xs text-slate-500">{t("ui.examiner.113")}</label>
            <textarea
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm min-h-[90px]"
              placeholder={t("me.examiner.007")}
              value={form.note}
              onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-xs text-slate-500">{t("me.examiner.011")}</label>
            <div className="flex flex-wrap gap-2">
              {attachments.map((src, i) => (
                <div
                  key={i}
                  className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-200"
                >
                  <img src={src} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                    className="absolute top-0.5 right-0.5 bg-black/50 text-white rounded-full p-0.5"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              {attachments.length < 3 && (
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
                        setAttachments((prev) => [...prev, base64]);
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
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="mt-4 w-full rounded-2xl bg-slate-900 text-white py-2 text-sm font-semibold flex items-center justify-center gap-2"
        >
          <Send size={16} />
          {submitting ? t("ui.examiner.608") : t("me.examiner.008")}
        </button>
        {hint && <div className="mt-3 text-xs text-amber-600">{hint}</div>}
      </section>

      <section className="dl-card" style={{ padding: 16 }}>
        <div className="text-sm font-semibold text-gray-900">{t("ui.examiner.114")}</div>
        {applications.length === 0 ? (
          <div className="mt-3">
            <StateBlock
              tone="empty"
              size="compact"
              title={t("me.examiner.009")}
              description={t("me.examiner.010")}
            />
          </div>
        ) : (
          <div className="mt-3 grid gap-3">
            {applications.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-[0_10px_30px_rgba(15,23,42,0.06)]"
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-gray-900">{item.name}</div>
                  <span className="text-xs text-emerald-600">{item.status}</span>
                </div>
                <div className="text-xs text-slate-500 mt-1">申请号：{item.id}</div>
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
