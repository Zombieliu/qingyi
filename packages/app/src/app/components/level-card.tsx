"use client";
import { useEffect, useState } from "react";
import { getCurrentAddress } from "@/lib/chain/qy-chain-lite";
import { fetchWithUserAuth } from "@/lib/auth/user-auth-client";
import { readCache, writeCache } from "@/lib/shared/client-cache";

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

const TIER_COLORS = [
  "from-gray-400 to-gray-500",
  "from-emerald-400 to-emerald-600",
  "from-blue-400 to-blue-600",
  "from-purple-400 to-purple-600",
  "from-amber-400 to-amber-600",
  "from-rose-400 to-rose-600",
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

    fetchWithUserAuth(`/api/user/level?userAddress=${addr}`, {}, addr)
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
        setCheckinResult("签到失败");
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
  const colorIdx = currentTier ? Math.min(currentTier.level, TIER_COLORS.length - 1) : 0;

  return (
    <div className="dl-card" style={{ marginBottom: 12, overflow: "hidden" }}>
      {/* Header gradient */}
      <div
        className={`bg-gradient-to-r ${TIER_COLORS[colorIdx]} px-4 py-3 text-white`}
        style={{ margin: "-12px -12px 12px -12px" }}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs opacity-80">我的等级</div>
            <div className="text-lg font-bold">
              {currentTier?.badge || "⭐"} {currentTier?.name || "新手"}
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">{points}</div>
            <div className="text-xs opacity-80">积分</div>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      {nextTier && (
        <div className="px-0 mb-3">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>{currentTier?.name || "新手"}</span>
            <span>{nextTier.name}</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${TIER_COLORS[colorIdx]}`}
              style={{ width: `${progress}%`, transition: "width 0.5s ease" }}
            />
          </div>
          <div className="text-xs text-gray-400 mt-1 text-center">还差 {pointsToNext} 积分升级</div>
        </div>
      )}

      {/* Tier roadmap */}
      {data.allTiers.length > 0 && (
        <div className="flex gap-1 mb-3 overflow-x-auto pb-1">
          {data.allTiers.map((tier) => (
            <div
              key={tier.id}
              className={`flex-shrink-0 px-2 py-1 rounded text-[10px] ${
                tier.reached
                  ? "bg-indigo-50 text-indigo-600 font-medium"
                  : "bg-gray-50 text-gray-400"
              }`}
            >
              {tier.badge || "⭐"} {tier.name}
              {tier.minPoints ? <span className="ml-1 opacity-60">{tier.minPoints}</span> : null}
            </div>
          ))}
        </div>
      )}

      {/* Checkin button */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-400">每日签到 +10 · 下单 1元=1分 · 评价 +20</div>
        <button
          className="dl-tab-btn"
          style={{ padding: "4px 12px", fontSize: 12 }}
          onClick={handleCheckin}
          disabled={checkinLoading}
        >
          {checkinLoading ? "签到中..." : "签到"}
        </button>
      </div>
      {checkinResult && (
        <div className="text-xs text-emerald-500 mt-2 text-center">{checkinResult}</div>
      )}
    </div>
  );
}
