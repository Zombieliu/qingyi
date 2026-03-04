"use client";
import { t } from "@/lib/i18n/t";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ImagePlus, Radio, Send, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { PASSKEY_STORAGE_KEY } from "@/app/components/passkey-wallet";
import { StateBlock } from "@/app/components/state-block";
import { fetchWithUserAuth } from "@/lib/auth/user-auth-client";
import { formatFullDateTime } from "@/lib/shared/date-utils";
import { useGuardianStatus } from "@/app/components/guardian-role";

const STORAGE_KEY = "qy_live_applications_v1";

type LiveApplication = {
  id: string;
  name: string;
  status: string;
  createdAt: number;
};

function loadLocalApplications(): LiveApplication[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LiveApplication[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistLocalApplications(list: LiveApplication[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 5)));
}

export default function LiveApplyPage() {
  const [form, setForm] = useState({
    name: "",
    contact: "",
    platform: "",
    liveUrl: "",
    games: "",
    liveTime: "",
    note: "",
  });
  const [attachments, setAttachments] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [applications, setApplications] = useState<LiveApplication[]>([]);
  const { state: guardianState, isGuardian } = useGuardianStatus();

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
      setHint(t("me.live.013"));
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
        "/api/live-applications",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name.trim(),
            contact: form.contact.trim(),
            platform: form.platform.trim(),
            liveUrl: form.liveUrl.trim(),
            games: form.games.trim(),
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
        if (data?.error === "guardian_required") {
          setHint(t("me.live.015"));
        } else {
          setHint(data?.error || t("tabs.me.live.i031"));
        }
        return;
      }
      const next: LiveApplication = {
        id: data?.id || `LIV-${Date.now()}`,
        name: form.name.trim(),
        status: t("tabs.me.live.i037"),
        createdAt: Date.now(),
      };
      const updated = [next, ...applications];
      setApplications(updated);
      persistLocalApplications(updated);
      setHint(t("apply.live_submitted"));
      setForm((prev) => ({ ...prev, note: "" }));
      setAttachments([]);
    } catch {
      setHint(t("error.network"));
    } finally {
      setSubmitting(false);
    }
  };

  let content: ReactNode;
  if (guardianState === "checking") {
    content = (
      <section className="dl-card" style={{ padding: 16 }}>
        <StateBlock tone="loading" size="compact" title={t("ui.live.101")} />
      </section>
    );
  } else if (!isGuardian) {
    content = (
      <section className="dl-card" style={{ padding: 16 }}>
        <StateBlock tone="warning" title={t("me.live.014")} description={t("me.live.015")} />
      </section>
    );
  } else {
    content = (
      <>
        <section className="dl-card" style={{ padding: 16 }}>
          <div className="text-sm font-semibold text-gray-900">{t("ui.live.103")}</div>
          <div className="mt-2 text-xs text-slate-500 space-y-2">
            <div>{t("ui.live.104")}</div>
            <div>{t("ui.live.105")}</div>
            <div>{t("ui.live.106")}</div>
          </div>
        </section>

        <section className="dl-card" style={{ padding: 16 }}>
          <div className="text-sm font-semibold text-gray-900">{t("ui.live.107")}</div>
          <div className="mt-3 grid gap-3">
            <div className="grid gap-2">
              <label className="text-xs text-slate-500">{t("ui.live.108")}</label>
              <input
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder={t("me.live.002")}
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-xs text-slate-500">{t("ui.live.109")}</label>
              <input
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder={t("me.live.003")}
                value={form.contact}
                onChange={(event) => setForm((prev) => ({ ...prev, contact: event.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-xs text-slate-500">{t("ui.live.110")}</label>
              <input
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder={t("me.live.004")}
                value={form.platform}
                onChange={(event) => setForm((prev) => ({ ...prev, platform: event.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-xs text-slate-500">{t("ui.live.111")}</label>
              <input
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder={t("me.live.005")}
                value={form.liveUrl}
                onChange={(event) => setForm((prev) => ({ ...prev, liveUrl: event.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-xs text-slate-500">{t("ui.live.112")}</label>
              <input
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder={t("me.live.006")}
                value={form.games}
                onChange={(event) => setForm((prev) => ({ ...prev, games: event.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-xs text-slate-500">{t("ui.live.113")}</label>
              <input
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder={t("me.live.007")}
                value={form.liveTime}
                onChange={(event) => setForm((prev) => ({ ...prev, liveTime: event.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-xs text-slate-500">{t("ui.live.114")}</label>
              <textarea
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm min-h-[90px]"
                placeholder={t("me.live.008")}
                value={form.note}
                onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-xs text-slate-500">{t("me.live.012")}</label>
              <div className="flex flex-wrap gap-2">
                {attachments.map((src, i) => (
                  <div
                    key={i}
                    className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-200"
                  >
                    <Image
                      src={src}
                      alt=""
                      fill
                      unoptimized
                      sizes="80px"
                      className="object-cover"
                    />
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
            {submitting ? t("ui.live.608") : t("me.live.009")}
          </button>
          {hint && <div className="mt-3 text-xs text-amber-600">{hint}</div>}
        </section>

        <section className="dl-card" style={{ padding: 16 }}>
          <div className="text-sm font-semibold text-gray-900">{t("ui.live.115")}</div>
          {applications.length === 0 ? (
            <div className="mt-3">
              <StateBlock
                tone="empty"
                size="compact"
                title={t("me.live.010")}
                description={t("me.live.011")}
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
      </>
    );
  }

  return (
    <div className="dl-main">
      <header className="dl-topbar">
        <div className="dl-time">
          <Link href="/me" className="dl-icon-circle" aria-label={t("me.live.001")}>
            <ArrowLeft size={16} />
          </Link>
          <span className="dl-time-text">{t("ui.live.101")}</span>
          <span className="dl-chip">{t("ui.live.102")}</span>
        </div>
        <div className="dl-actions">
          <span className="dl-icon-circle">
            <Radio size={16} />
          </span>
        </div>
      </header>

      {content}
    </div>
  );
}
