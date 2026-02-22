"use client";
import { t } from "@/lib/i18n/i18n-client";

import Link from "next/link";
import { ArrowLeft, Gamepad2, Save } from "lucide-react";
import { useMemo, useState } from "react";
import { PASSKEY_STORAGE_KEY } from "@/app/components/passkey-wallet";
import { GAME_PROFILE_KEY } from "@/lib/shared/constants";
import { formatFullDateTime } from "@/lib/shared/date-utils";

const STORAGE_KEY = GAME_PROFILE_KEY;

type GameProfile = {
  gameName: string;
  gameId: string;
  updatedAt: number;
  userAddress?: string;
};

type StoredProfiles = Record<string, GameProfile>;

function loadProfile(key: string): GameProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredProfiles;
    return parsed?.[key] || null;
  } catch {
    return null;
  }
}

function persistProfile(key: string, profile: GameProfile) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as StoredProfiles) : {};
    const next = { ...parsed, [key]: profile };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
}

export default function GameSettingsPage() {
  const walletAddress = useMemo(() => {
    if (typeof window === "undefined") return "";
    try {
      const raw = localStorage.getItem(PASSKEY_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as { address?: string }).address || "" : "";
    } catch {
      return "";
    }
  }, []);

  const profileKey = walletAddress || "local";

  return (
    <div className="dl-main">
      <header className="dl-topbar">
        <div className="dl-time">
          <Link href="/me" className="dl-icon-circle" aria-label={t("me.game_settings.001")}>
            <ArrowLeft size={16} />
          </Link>
          <span className="dl-time-text">{t("ui.game-settings.063")}</span>
          <span className="dl-chip">{t("ui.game-settings.064")}</span>
        </div>
        <div className="dl-actions">
          <span className="dl-icon-circle">
            <Gamepad2 size={16} />
          </span>
        </div>
      </header>

      <GameSettingsForm key={profileKey} profileKey={profileKey} walletAddress={walletAddress} />
    </div>
  );
}

function GameSettingsForm({
  profileKey,
  walletAddress,
}: {
  profileKey: string;
  walletAddress: string;
}) {
  const initialProfile = loadProfile(profileKey);
  const [form, setForm] = useState(() => ({
    gameName: initialProfile?.gameName ?? "",
    gameId: initialProfile?.gameId ?? "",
  }));
  const [saving, setSaving] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(() => initialProfile?.updatedAt ?? null);

  const save = () => {
    if (!form.gameName.trim() || !form.gameId.trim()) {
      setHint("form.game_info_required");
      return;
    }
    setSaving(true);
    setHint(null);
    const payload: GameProfile = {
      gameName: form.gameName.trim(),
      gameId: form.gameId.trim(),
      updatedAt: Date.now(),
      userAddress: walletAddress || undefined,
    };
    persistProfile(profileKey, payload);
    setSavedAt(payload.updatedAt);
    setHint("status.saved");
    setSaving(false);
  };

  return (
    <section className="dl-card" style={{ padding: 16 }}>
      <div className="text-sm font-semibold text-gray-900">{t("ui.game-settings.065")}</div>
      <div className="mt-2 text-xs text-slate-500">{t("ui.game-settings.066")}</div>
      <div className="mt-4 grid gap-3">
        <div className="grid gap-2">
          <label className="text-xs text-slate-500">{t("ui.game-settings.067")}</label>
          <input
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
            placeholder={t("me.game_settings.002")}
            value={form.gameName}
            onChange={(event) => setForm((prev) => ({ ...prev, gameName: event.target.value }))}
          />
        </div>
        <div className="grid gap-2">
          <label className="text-xs text-slate-500">{t("ui.game-settings.068")}</label>
          <input
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
            placeholder={t("me.game_settings.003")}
            value={form.gameId}
            onChange={(event) => setForm((prev) => ({ ...prev, gameId: event.target.value }))}
          />
        </div>
      </div>
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="mt-4 w-full rounded-2xl bg-slate-900 text-white py-2 text-sm font-semibold flex items-center justify-center gap-2"
      >
        <Save size={16} />
        {saving ? t("ui.game-settings.530") : t("me.game_settings.004")}
      </button>
      {hint && <div className="mt-3 text-xs text-emerald-600">{hint}</div>}
      {savedAt && (
        <div className="mt-2 text-[11px] text-slate-400">
          最近保存：{formatFullDateTime(savedAt)}
        </div>
      )}
    </section>
  );
}
