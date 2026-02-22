"use client";
import { t } from "@/lib/i18n/i18n-client";

import Link from "next/link";
import { ArrowLeft, ShieldCheck, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PASSKEY_STORAGE_KEY } from "@/app/components/passkey-wallet";
import { StateBlock } from "@/app/components/state-block";
import { fetchWithUserAuth } from "@/lib/auth/user-auth-client";
import { formatFullDateTime } from "@/lib/shared/date-utils";

const STORAGE_KEY = "qy_guardian_applications_v1";

type GuardianApplication = {
  id: string;
  name: string;
  status: string;
  createdAt: number;
};

function loadLocalApplications(): GuardianApplication[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as GuardianApplication[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistLocalApplications(list: GuardianApplication[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 5)));
}

export default function GuardianPage() {
  const [form, setForm] = useState({
    name: "",
    contact: "",
    games: "",
    experience: "",
    availability: "",
    note: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [applications, setApplications] = useState<GuardianApplication[]>([]);

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
      setHint("form.name_contact_required");
      return;
    }
    if (!walletAddress) {
      setHint("auth.login_before_apply");
      return;
    }
    setSubmitting(true);
    setHint(null);
    try {
      const res = await fetchWithUserAuth(
        "/api/guardians",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name.trim(),
            contact: form.contact.trim(),
            games: form.games.trim(),
            experience: form.experience.trim(),
            availability: form.availability.trim(),
            note: form.note.trim(),
            userAddress: walletAddress,
          }),
        },
        walletAddress
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setHint(data?.error || "提交失败，请稍后重试");
        return;
      }
      const next: GuardianApplication = {
        id: data?.id || `GUARD-${Date.now()}`,
        name: form.name.trim(),
        status: "待审核",
        createdAt: Date.now(),
      };
      const updated = [next, ...applications];
      setApplications(updated);
      persistLocalApplications(updated);
      setHint("apply.companion_submitted");
      setForm((prev) => ({ ...prev, note: "" }));
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
          <Link href="/me" className="dl-icon-circle" aria-label={t("me.guardian.001")}>
            <ArrowLeft size={16} />
          </Link>
          <span className="dl-time-text">成为陪练</span>
          <span className="dl-chip">达人招募</span>
        </div>
        <div className="dl-actions">
          <span className="dl-icon-circle">
            <ShieldCheck size={16} />
          </span>
        </div>
      </header>

      <section className="dl-card" style={{ padding: 16 }}>
        <div className="text-sm font-semibold text-gray-900">入驻条件</div>
        <div className="mt-2 text-xs text-slate-500 space-y-2">
          <div>1. 熟练掌握热门游戏，具备稳定上分或教学能力。</div>
          <div>2. 近 30 天游玩时长 60 小时以上。</div>
          <div>3. 具备良好的沟通能力与服务意识。</div>
        </div>
      </section>

      <section className="dl-card" style={{ padding: 16 }}>
        <div className="text-sm font-semibold text-gray-900">提交陪练申请</div>
        <div className="mt-3 grid gap-3">
          <div className="grid gap-2">
            <label className="text-xs text-slate-500">姓名 / 昵称</label>
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
              placeholder={t("me.guardian.002")}
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-xs text-slate-500">联系方式</label>
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
              placeholder={t("me.guardian.003")}
              value={form.contact}
              onChange={(event) => setForm((prev) => ({ ...prev, contact: event.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-xs text-slate-500">擅长游戏</label>
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
              placeholder={t("me.guardian.004")}
              value={form.games}
              onChange={(event) => setForm((prev) => ({ ...prev, games: event.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-xs text-slate-500">段位与经验</label>
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
              placeholder={t("me.guardian.005")}
              value={form.experience}
              onChange={(event) => setForm((prev) => ({ ...prev, experience: event.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-xs text-slate-500">可接单时段</label>
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
              placeholder={t("me.guardian.006")}
              value={form.availability}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, availability: event.target.value }))
              }
            />
          </div>
          <div className="grid gap-2">
            <label className="text-xs text-slate-500">补充说明</label>
            <textarea
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm min-h-[90px]"
              placeholder={t("me.guardian.007")}
              value={form.note}
              onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
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
          {submitting ? "提交中..." : t("me.guardian.008")}
        </button>
        {hint && <div className="mt-3 text-xs text-amber-600">{hint}</div>}
      </section>

      <section className="dl-card" style={{ padding: 16 }}>
        <div className="text-sm font-semibold text-gray-900">申请进度</div>
        {applications.length === 0 ? (
          <div className="mt-3">
            <StateBlock
              tone="empty"
              size="compact"
              title={t("me.guardian.009")}
              description={t("me.guardian.010")}
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
