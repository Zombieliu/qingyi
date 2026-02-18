"use client";

import Link from "next/link";
import { ArrowLeft, Copy, Gift, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { getCurrentAddress } from "@/lib/chain/qy-chain";
import { fetchWithUserAuth } from "@/app/components/user-auth-client";
import { StateBlock } from "@/app/components/state-block";

type ReferralStatus = {
  refCode: string;
  invitedBy: { inviterAddress: string; status: string; rewardInvitee?: number } | null;
  inviteCount: number;
  rewardedCount: number;
  totalReward: number;
  invites: {
    inviteeAddress: string;
    status: string;
    rewardInviter?: number;
    createdAt: number;
    rewardedAt?: number;
  }[];
};

type LeaderboardEntry = {
  rank: number;
  address: string;
  value: number;
  extra?: number;
};

const BOARD_TYPES = [
  { key: "spend", label: "消费榜" },
  { key: "companion", label: "陪练榜" },
  { key: "referral", label: "邀请榜" },
] as const;

const BOARD_PERIODS = [
  { key: "all", label: "总榜" },
  { key: "week", label: "周榜" },
  { key: "month", label: "月榜" },
] as const;

function shortAddr(addr: string) {
  if (!addr || addr.length < 12) return addr;
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

export default function ReferralPage() {
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState<ReferralStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [boardType, setBoardType] = useState<"spend" | "companion" | "referral">("spend");
  const [boardPeriod, setBoardPeriod] = useState<"all" | "week" | "month">("all");
  const [board, setBoard] = useState<LeaderboardEntry[]>([]);
  const [boardLoading, setBoardLoading] = useState(false);

  useEffect(() => {
    const addr = getCurrentAddress();
    setAddress(addr || "");
    if (!addr) {
      setLoading(false);
      return;
    }
    fetchWithUserAuth(`/api/referral/status?address=${addr}`, {}, addr)
      .then(async (res) => {
        if (res.ok) {
          setStatus(await res.json());
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setBoardLoading(true);
    fetch(`/api/referral/leaderboard?type=${boardType}&period=${boardPeriod}&limit=50`)
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setBoard(Array.isArray(data?.entries) ? data.entries : []);
        }
      })
      .catch(() => {})
      .finally(() => setBoardLoading(false));
  }, [boardType, boardPeriod]);

  const copyRefLink = async () => {
    if (!status?.refCode) return;
    const link = `${window.location.origin}/?ref=${status.refCode}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <div className="dl-main">
      <header className="dl-topbar">
        <div className="dl-time">
          <Link href="/me" className="dl-icon-circle" aria-label="返回我的">
            <ArrowLeft size={16} />
          </Link>
          <span className="dl-time-text">邀请返利</span>
          <span className="dl-chip">赚馒头</span>
        </div>
        <div className="dl-actions">
          <span className="dl-icon-circle">
            <Gift size={16} />
          </span>
        </div>
      </header>

      {loading ? (
        <section className="dl-card" style={{ padding: 16 }}>
          <StateBlock tone="loading" size="compact" title="加载中" />
        </section>
      ) : !address ? (
        <section className="dl-card" style={{ padding: 16 }}>
          <StateBlock tone="warning" size="compact" title="请先登录" description="登录后可查看邀请码和返利信息" />
        </section>
      ) : (
        <>
          <section className="dl-card" style={{ padding: 16 }}>
            <div className="text-sm font-semibold text-gray-900">我的邀请码</div>
            <div className="mt-2 flex items-center gap-2">
              <code className="rounded-lg bg-slate-100 px-3 py-1.5 text-lg font-bold tracking-wider text-pink-600">
                {status?.refCode || "—"}
              </code>
              <button
                type="button"
                onClick={copyRefLink}
                className="flex items-center gap-1 rounded-lg bg-pink-50 px-3 py-1.5 text-xs font-medium text-pink-600"
              >
                <Copy size={12} />
                {copied ? "已复制" : "复制链接"}
              </button>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              分享邀请链接给好友，好友首单完成后双方均可获得馒头奖励
            </div>
          </section>

          <section className="dl-card" style={{ padding: 16, marginTop: 12 }}>
            <div className="text-sm font-semibold text-gray-900">返利统计</div>
            <div className="mt-3 grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-xl font-bold text-pink-600">{status?.inviteCount ?? 0}</div>
                <div className="text-xs text-slate-500">邀请人数</div>
              </div>
              <div>
                <div className="text-xl font-bold text-emerald-600">{status?.rewardedCount ?? 0}</div>
                <div className="text-xs text-slate-500">已返利</div>
              </div>
              <div>
                <div className="text-xl font-bold text-amber-600">{status?.totalReward ?? 0}</div>
                <div className="text-xs text-slate-500">总馒头</div>
              </div>
            </div>
            {status?.invitedBy && (
              <div className="mt-3 rounded-lg bg-slate-50 p-2 text-xs text-slate-500">
                我的邀请人：{shortAddr(status.invitedBy.inviterAddress)}
                {status.invitedBy.status === "rewarded" && status.invitedBy.rewardInvitee
                  ? ` · 已获奖励 ${status.invitedBy.rewardInvitee} 馒头`
                  : " · 待首单完成"}
              </div>
            )}
          </section>

          {status?.invites && status.invites.length > 0 && (
            <section className="dl-card" style={{ padding: 16, marginTop: 12 }}>
              <div className="text-sm font-semibold text-gray-900">邀请记录</div>
              <div className="mt-3 grid gap-2">
                {status.invites.map((inv) => (
                  <div key={inv.inviteeAddress} className="rounded-xl border border-slate-100 p-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">{shortAddr(inv.inviteeAddress)}</span>
                      <span className={inv.status === "rewarded" ? "font-semibold text-emerald-600" : "text-slate-400"}>
                        {inv.status === "rewarded" ? `+${inv.rewardInviter ?? 0} 馒头` : "待完成首单"}
                      </span>
                    </div>
                    <div className="mt-1 text-slate-400">
                      {new Date(inv.createdAt).toLocaleString("zh-CN")}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <section className="dl-card" style={{ padding: 16, marginTop: 12, marginBottom: 24 }}>
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Trophy size={16} className="text-amber-500" />
          排行榜
        </div>
        <div className="lc-tabs" style={{ marginTop: 8 }}>
          {BOARD_TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`lc-tab-btn ${boardType === t.key ? "is-active" : ""}`}
              onClick={() => setBoardType(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="lc-tabs" style={{ marginTop: 4 }}>
          {BOARD_PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              className={`lc-tab-btn ${boardPeriod === p.key ? "is-active" : ""}`}
              onClick={() => setBoardPeriod(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {boardLoading ? (
          <div className="mt-3">
            <StateBlock tone="loading" size="compact" title="加载中" />
          </div>
        ) : board.length === 0 ? (
          <div className="mt-3">
            <StateBlock tone="empty" size="compact" title="暂无数据" description="还没有排行数据" />
          </div>
        ) : (
          <div className="mt-3 grid gap-2">
            {board.map((entry) => (
              <div key={entry.rank} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 text-xs">
                <span className={`w-6 text-center font-bold ${entry.rank <= 3 ? "text-amber-500" : "text-slate-400"}`}>
                  {entry.rank}
                </span>
                <span className="flex-1 text-slate-700">{shortAddr(entry.address)}</span>
                <span className="font-semibold text-pink-600">
                  {boardType === "spend"
                    ? `¥${entry.value}`
                    : boardType === "companion"
                      ? `${entry.value} 单`
                      : `${entry.value} 人`}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
