"use client";

import Link from "next/link";
import { ArrowLeft, Gamepad2, Save } from "lucide-react";
import { useMemo, useState } from "react";
import { PASSKEY_STORAGE_KEY } from "@/app/components/passkey-wallet";

const STORAGE_KEY = "qy_game_profile_v1";

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
          <Link href="/me" className="dl-icon-circle" aria-label="返回我的">
            <ArrowLeft size={16} />
          </Link>
          <span className="dl-time-text">游戏设置</span>
          <span className="dl-chip">账号资料</span>
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

function GameSettingsForm({ profileKey, walletAddress }: { profileKey: string; walletAddress: string }) {
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
      setHint("请填写游戏用户名和游戏ID");
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
    setHint("已保存");
    setSaving(false);
  };

  return (
    <section className="dl-card" style={{ padding: 16 }}>
      <div className="text-sm font-semibold text-gray-900">编辑游戏账号</div>
      <div className="mt-2 text-xs text-slate-500">用于派单与身份核验，信息仅对你可见。</div>
      <div className="mt-4 grid gap-3">
        <div className="grid gap-2">
          <label className="text-xs text-slate-500">游戏用户名</label>
          <input
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
            placeholder="如：夜风"
            value={form.gameName}
            onChange={(event) => setForm((prev) => ({ ...prev, gameName: event.target.value }))}
          />
        </div>
        <div className="grid gap-2">
          <label className="text-xs text-slate-500">游戏ID</label>
          <input
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
            placeholder="请输入游戏ID"
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
        {saving ? "保存中..." : "保存设置"}
      </button>
      {hint && <div className="mt-3 text-xs text-emerald-600">{hint}</div>}
      {savedAt && (
        <div className="mt-2 text-[11px] text-slate-400">
          最近保存：{new Date(savedAt).toLocaleString("zh-CN")}
        </div>
      )}
    </section>
  );
}
