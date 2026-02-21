"use client";

import Link from "next/link";
import { ArrowLeft, TicketPercent, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { readCache, writeCache } from "@/lib/shared/client-cache";
import { StateBlock } from "@/app/components/state-block";
import { getCurrentAddress } from "@/lib/chain/qy-chain";
import { fetchWithUserAuth } from "@/lib/auth/user-auth-client";

type Coupon = {
  id: string;
  title: string;
  code?: string | null;
  description?: string | null;
  discount?: number | null;
  minSpend?: number | null;
  status: string;
  startsAt?: number | null;
  expiresAt?: number | null;
};

const STORAGE_KEY = "qy_coupon_claims_v1";

function loadClaims(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveClaims(ids: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [claims, setClaims] = useState<string[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [redeemCode, setRedeemCode] = useState("");
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [redeemHint, setRedeemHint] = useState<string | null>(null);
  const [redeemReward, setRedeemReward] = useState<{
    type: string;
    amount?: number;
    days?: number;
    tierName?: string;
    coupon?: { title?: string; code?: string };
    message?: string;
  } | null>(null);
  const cacheTtlMs = 60_000;

  useEffect(() => {
    setClaims(loadClaims());
  }, []);

  useEffect(() => {
    const load = async () => {
      const cacheKey = "cache:coupons";
      const cached = readCache<Coupon[]>(cacheKey, cacheTtlMs, true);
      if (cached) {
        setCoupons(Array.isArray(cached.value) ? cached.value : []);
      }
      setLoading(true);
      try {
        const res = await fetch("/api/coupons");
        if (res.ok) {
          const data = await res.json();
          const next = Array.isArray(data) ? data : [];
          setCoupons(next);
          writeCache(cacheKey, next);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const availableCount = useMemo(() => coupons.length, [coupons]);
  const claimedCount = useMemo(() => claims.length, [claims]);

  const handleClaim = (couponId: string) => {
    if (claims.includes(couponId)) return;
    const next = [couponId, ...claims];
    setClaims(next);
    saveClaims(next);
    setHint("已领取，已加入本地卡包");
    setTimeout(() => setHint(null), 2500);
  };

  const redeemSummary = useMemo(() => {
    if (!redeemReward) return null;
    if (redeemReward.type === "mantou") return `已到账 ${redeemReward.amount ?? 0} 馒头`;
    if (redeemReward.type === "diamond") return `已到账 ${redeemReward.amount ?? 0} 钻石`;
    if (redeemReward.type === "vip")
      return `会员已延长 ${redeemReward.days ?? 0} 天${redeemReward.tierName ? `（${redeemReward.tierName}）` : ""}`;
    if (redeemReward.type === "coupon") {
      return redeemReward.coupon?.title
        ? `已领取优惠券：${redeemReward.coupon.title}`
        : "已领取优惠券";
    }
    return redeemReward.message || "兑换成功";
  }, [redeemReward]);

  const handleRedeem = async () => {
    const raw = redeemCode.trim();
    if (!raw) {
      setRedeemHint("请输入卡密");
      return;
    }
    const address = getCurrentAddress();
    if (!address) {
      setRedeemHint("请先登录账号");
      return;
    }
    if (redeemLoading) return;
    setRedeemLoading(true);
    setRedeemHint(null);
    try {
      const res = await fetchWithUserAuth(
        "/api/redeem",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address, code: raw }),
        },
        address
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRedeemHint(data?.error || "兑换失败");
        return;
      }
      setRedeemReward(data?.reward || null);
      setRedeemCode("");
      setRedeemHint(data?.duplicated ? "已兑换过该卡密" : "兑换成功");
    } catch {
      setRedeemHint("兑换失败，请稍后再试");
    } finally {
      setRedeemLoading(false);
    }
  };

  return (
    <div className="dl-main">
      <header className="dl-topbar">
        <div className="dl-time">
          <Link href="/me" className="dl-icon-circle" aria-label="返回我的">
            <ArrowLeft size={16} />
          </Link>
          <span className="dl-time-text">优惠卡券</span>
          <span className="dl-chip">福利中心</span>
        </div>
        <div className="dl-actions">
          <span className="dl-icon-circle">
            <Sparkles size={16} />
          </span>
        </div>
      </header>

      <section className="dl-card" style={{ padding: 16 }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-900">我的卡包</div>
            <div className="text-xs text-slate-500 mt-1">
              已领取 {claimedCount} 张，可用 {availableCount} 张
            </div>
          </div>
          <div className="text-xs text-slate-500">自动叠加最优优惠</div>
        </div>
      </section>

      <section className="dl-card" style={{ padding: 16, marginTop: 12 }}>
        <div className="text-sm font-semibold text-gray-900">卡密兑换</div>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
            placeholder="输入卡密"
            value={redeemCode}
            onChange={(event) => setRedeemCode(event.target.value)}
          />
          <button
            type="button"
            onClick={handleRedeem}
            disabled={redeemLoading}
            className={`h-10 rounded-xl px-4 text-sm font-semibold ${
              redeemLoading ? "bg-slate-200 text-slate-500" : "bg-slate-900 text-white"
            }`}
          >
            {redeemLoading ? "兑换中..." : "立即兑换"}
          </button>
        </div>
        {redeemHint && <div className="mt-2 text-xs text-emerald-600">{redeemHint}</div>}
        {redeemSummary && <div className="mt-1 text-xs text-slate-500">{redeemSummary}</div>}
      </section>

      <section className="dl-card" style={{ padding: 16 }}>
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-900">可领取优惠</div>
          <TicketPercent size={16} className="text-slate-500" />
        </div>
        {loading ? (
          <div className="mt-3">
            <StateBlock tone="loading" size="compact" title="加载中" description="正在同步优惠券" />
          </div>
        ) : coupons.length === 0 ? (
          <div className="mt-3">
            <StateBlock
              tone="empty"
              size="compact"
              title="暂无可用优惠券"
              description="稍后再试或留意活动"
            />
          </div>
        ) : (
          <div className="mt-3 grid gap-3">
            {coupons.map((coupon) => {
              const claimed = claims.includes(coupon.id);
              const discountLabel =
                typeof coupon.discount === "number" ? `立减 ¥${coupon.discount}` : "专属权益";
              const minSpendLabel =
                typeof coupon.minSpend === "number" ? `满 ¥${coupon.minSpend} 可用` : "无门槛";
              const dateLabel = coupon.expiresAt
                ? `有效期至 ${new Date(coupon.expiresAt).toLocaleDateString("zh-CN")}`
                : "长期有效";
              return (
                <div
                  key={coupon.id}
                  className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-[0_10px_30px_rgba(15,23,42,0.06)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{coupon.title}</div>
                      <div className="text-xs text-amber-600 mt-1">{discountLabel}</div>
                      <div className="text-xs text-slate-500 mt-1">{minSpendLabel}</div>
                      {coupon.description ? (
                        <div className="text-xs text-slate-500 mt-1">{coupon.description}</div>
                      ) : null}
                      <div className="text-[11px] text-slate-400 mt-2">{dateLabel}</div>
                    </div>
                    <button
                      type="button"
                      disabled={claimed}
                      onClick={() => handleClaim(coupon.id)}
                      className={`h-8 px-3 rounded-full text-xs font-semibold ${
                        claimed ? "bg-slate-200 text-slate-500" : "bg-slate-900 text-white"
                      }`}
                    >
                      {claimed ? "已领取" : "领取"}
                    </button>
                  </div>
                  {coupon.code ? (
                    <div className="mt-2 text-xs text-slate-500">兑换码：{coupon.code}</div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
        {hint && <div className="mt-3 text-xs text-emerald-600">{hint}</div>}
      </section>
    </div>
  );
}
