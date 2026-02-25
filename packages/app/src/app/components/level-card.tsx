"use client";
import { useEffect, useState } from "react";
import { getCurrentAddress } from "@/lib/chain/qy-chain-lite";
import { fetchWithUserAuth } from "@/lib/auth/user-auth-client";
import { readCache, writeCache } from "@/lib/shared/client-cache";
import { t } from "@/lib/i18n/t";

type LevelProgress = {
  points: number;
  currentTier: { id: string; name: string; level: number; badge?: string } | null;
  nextTier: { id: string; name: string; level: number; minPoints?: number } | null;
  pointsToNext: number;
  progress: number;
  isVip: boolean;
  allTiers: {
    id: string;
    name: string;
    level: number;
    badge?: string;
    minPoints?: number;
    reached: boolean;
  }[];
};

// Progress bar gradient per tier level
const TIER_BAR_COLORS = [
  "linear-gradient(90deg, #0ea5e9, #38bdf8)",
  "linear-gradient(90deg, #10b981, #34d399)",
  "linear-gradient(90deg, #3b82f6, #60a5fa)",
  "linear-gradient(90deg, #8b5cf6, #a78bfa)",
  "linear-gradient(90deg, #f59e0b, #fbbf24)",
  "linear-gradient(90deg, #f43f5e, #fb7185)",
];

export function LevelCard() {
  const [data, setData] = useState<LevelProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [checkinResult, setCheckinResult] = useState<string | null>(null);

  useEffect(() => {
    const addr = getCurrentAddress();
    if (!addr) {
      setLoading(false);
      return;
    }

    const cacheKey = `cache:user:level:${addr}`;
    const cached = readCache<LevelProgress>(cacheKey, 30_000, true);
    if (cached?.value) setData(cached.value);

    fetchWithUserAuth(`/api/user/level?userAddress=${addr}`, {}, addr, { silent: true })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setData(d);
          writeCache(cacheKey, d);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleCheckin = async () => {
    const addr = getCurrentAddress();
    if (!addr) return;
    setCheckinLoading(true);
    try {
      const res = await fetchWithUserAuth(
        "/api/user/level",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userAddress: addr }),
        },
        addr
      );
      const json = await res.json();
      if (json.ok) {
        setCheckinResult(
          `+${json.earned} 积分${json.upgraded ? ` 🎉 升级到 ${json.upgraded.tierName}` : ""}`
        );
        // Refresh data
        const refreshRes = await fetchWithUserAuth(`/api/user/level?userAddress=${addr}`, {}, addr);
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          setData(refreshData);
          writeCache(`cache:user:level:${addr}`, refreshData);
        }
      } else {
        setCheckinResult(
          json.error === "already_checked_in"
            ? t("components.level_card.i156")
            : t("components.level_card.i157")
        );
      }
    } catch {
      setCheckinResult("签到失败");
    } finally {
      setCheckinLoading(false);
      setTimeout(() => setCheckinResult(null), 3000);
    }
  };

  if (loading && !data) return null;
  if (!data) return null;

  const { points, currentTier, nextTier, pointsToNext, progress } = data;
  const colorIdx = currentTier ? Math.min(currentTier.level, TIER_BAR_COLORS.length - 1) : 0;
  const barGradient = TIER_BAR_COLORS[colorIdx];

  return (
    <div className="dl-card">
      {/* Level + Points header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              borderRadius: "var(--radius-md)",
              background: barGradient,
              fontSize: 20,
              boxShadow: "0 6px 14px rgba(14, 165, 233, 0.18)",
            }}
          >
            {currentTier?.badge || "⭐"}
          </span>
          <div>
            <div
              style={{
                fontSize: "var(--text-lg)",
                fontWeight: 700,
                color: "var(--ink-strong)",
                lineHeight: 1.2,
              }}
            >
              {currentTier?.name || t("components.level_card.i158")}
            </div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--muted-2)", marginTop: 2 }}>
              我的等级
            </div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "var(--text-xl)", fontWeight: 700, color: "var(--ink-strong)" }}>
            {points}
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--muted-2)" }}>积分</div>
        </div>
      </div>

      {/* Progress bar */}
      {nextTier && (
        <div style={{ marginBottom: 14 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "var(--text-xs)",
              color: "var(--muted)",
              marginBottom: 6,
            }}
          >
            <span>{currentTier?.name || t("components.level_card.i159")}</span>
            <span>{nextTier.name}</span>
          </div>
          <div
            style={{
              height: 6,
              borderRadius: "var(--radius-pill)",
              background: "var(--surface-2)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                borderRadius: "var(--radius-pill)",
                background: barGradient,
                width: `${progress}%`,
                transition: "width 0.5s cubic-bezier(0.22, 1, 0.36, 1)",
              }}
            />
          </div>
          <div
            style={{
              fontSize: "var(--text-xs)",
              color: "var(--muted-2)",
              marginTop: 4,
              textAlign: "center",
            }}
          >
            还差 {pointsToNext} 积分升级
          </div>
        </div>
      )}

      {/* Tier roadmap */}
      {data.allTiers.length > 0 && (
        <div
          style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto", paddingBottom: 2 }}
        >
          {data.allTiers.map((tier, i) => {
            const reached = tier.reached;
            const isCurrent = currentTier?.id === tier.id;
            return (
              <div
                key={tier.id}
                style={{
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 10px",
                  borderRadius: "var(--radius-pill)",
                  fontSize: "var(--text-xs)",
                  fontWeight: isCurrent ? 600 : 400,
                  background: isCurrent
                    ? "var(--chip-bg)"
                    : reached
                      ? "var(--surface-2)"
                      : "var(--tag-bg)",
                  color: isCurrent
                    ? "var(--chip-text)"
                    : reached
                      ? "var(--muted)"
                      : "var(--muted-2)",
                  border: isCurrent ? "1px solid var(--chip-border)" : "1px solid transparent",
                }}
              >
                <span style={{ fontSize: 13 }}>{tier.badge || "⭐"}</span>
                {tier.name}
              </div>
            );
          })}
        </div>
      )}

      {/* Checkin + rules */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 12px",
          borderRadius: "var(--radius-sm)",
          background: "var(--surface-2)",
          border: "1px solid var(--border-soft)",
        }}
      >
        <div style={{ fontSize: "var(--text-xs)", color: "var(--muted)", lineHeight: 1.4 }}>
          每日签到 +10 · 下单 1元=1分 · 评价 +20
        </div>
        <button
          className="dl-tab-btn primary"
          style={{ padding: "6px 16px", fontSize: "var(--text-sm)", flexShrink: 0, marginLeft: 10 }}
          onClick={handleCheckin}
          disabled={checkinLoading}
        >
          {checkinLoading ? t("components.level_card.i160") : t("components.level_card.i161")}
        </button>
      </div>
      {checkinResult && (
        <div
          style={{
            fontSize: "var(--text-xs)",
            color: "var(--success)",
            marginTop: 8,
            textAlign: "center",
          }}
        >
          {checkinResult}
        </div>
      )}
    </div>
  );
}
