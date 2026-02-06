"use client";

import Link from "next/link";
import { ArrowLeft, Crown, Shield } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PASSKEY_STORAGE_KEY } from "@/app/components/passkey-wallet";
import { readCache, writeCache } from "@/app/components/client-cache";
import type { AdminMember, AdminMembershipTier } from "@/lib/admin-types";
import { isVisualTestMode } from "@/lib/qy-chain";

const fallbackPerks = [
  { label: "贵族铭牌", desc: "坚韧白银专属" },
  { label: "隐蔽访问足迹", desc: "隐藏钻石浏览" },
  { label: "特邀隐身", desc: "冰紫遮蔽群聊" },
  { label: "隐身潮玩状态", desc: "乔治态度切换" },
  { label: "隐身进厅", desc: "荷姆红毯静默" },
  { label: "厅内防骚扰", desc: "屏蔽关键信号" },
  { label: "厅内防锁踢", desc: "幻灭系楼层盾" },
];

function normalizePerks(perks?: AdminMembershipTier["perks"]) {
  if (!perks) return fallbackPerks;
  if (Array.isArray(perks)) {
    return perks.map((item) =>
      typeof item === "string" ? { label: item } : { label: item.label, desc: item.desc }
    );
  }
  return fallbackPerks;
}

export default function Vip() {
  const [tiers, setTiers] = useState<AdminMembershipTier[]>([]);
  const [member, setMember] = useState<AdminMember | null>(null);
  const [selectedTierId, setSelectedTierId] = useState<string>("");
  const [contact, setContact] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const cacheTtlMs = 60_000;

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
    const load = async () => {
      if (isVisualTestMode()) {
        setTiers([]);
        setMember(null);
        return;
      }
      try {
        const tiersCacheKey = "cache:vip:tiers";
        const memberCacheKey = walletAddress ? `cache:vip:member:${walletAddress}` : "";
        const cachedTiers = readCache<AdminMembershipTier[]>(tiersCacheKey, cacheTtlMs, true);
        if (cachedTiers) {
          setTiers(Array.isArray(cachedTiers.value) ? cachedTiers.value : []);
        }
        const cachedMember =
          memberCacheKey && walletAddress ? readCache<AdminMember | null>(memberCacheKey, cacheTtlMs, true) : null;
        if (cachedMember) {
          setMember(cachedMember.value || null);
        }
        const [tiersRes, memberRes] = await Promise.all([
          fetch("/api/vip/tiers"),
          walletAddress ? fetch(`/api/vip/status?userAddress=${walletAddress}`) : Promise.resolve(null),
        ]);
        if (tiersRes.ok) {
          const data = await tiersRes.json();
          const next = Array.isArray(data) ? data : [];
          setTiers(next);
          writeCache(tiersCacheKey, next);
        }
        if (memberRes && memberRes.ok) {
          const data = await memberRes.json();
          const next = data?.member || null;
          setMember(next);
          if (memberCacheKey) writeCache(memberCacheKey, next);
        }
      } catch {
        // ignore
      }
    };
    load();
  }, [walletAddress]);

  useEffect(() => {
    if (member?.tierId) {
      setSelectedTierId(member.tierId);
    } else if (tiers.length > 0) {
      setSelectedTierId(tiers[0].id);
    }
  }, [member?.tierId, tiers]);

  const selectedTier = useMemo(() => tiers.find((t) => t.id === selectedTierId) || tiers[0], [tiers, selectedTierId]);
  const perks = normalizePerks(selectedTier?.perks);

  const currentTier = member?.tierId ? tiers.find((t) => t.id === member.tierId) : null;
  const nextTier = useMemo(() => {
    if (!currentTier) return tiers[0] || null;
    return tiers.find((t) => t.level === currentTier.level + 1) || null;
  }, [currentTier, tiers]);

  const progressText = useMemo(() => {
    if (!member || !currentTier) return "完成会员申请后解锁完整权益";
    const points = member.points || 0;
    if (!nextTier || !nextTier.minPoints) return `成长值 ${points}`;
    const remaining = Math.max(nextTier.minPoints - points, 0);
    return `成长值 ${points}，距升级还需 ${remaining}`;
  }, [member, currentTier, nextTier]);

  const handleRequest = async () => {
    if (!walletAddress) {
      setHint("请先完成登录后再申请会员");
      return;
    }
    if (!selectedTier) {
      setHint("暂无可用会员等级");
      return;
    }
    setSubmitting(true);
    setHint(null);
    try {
      const res = await fetch("/api/vip/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userAddress: walletAddress,
          userName: "糕手玩玩",
          contact: contact.trim(),
          tierId: selectedTier.id,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setHint(data?.error || "提交失败，请稍后重试");
        return;
      }
      setHint("申请已提交，运营审核后开通会员权益");
    } catch {
      setHint("网络异常，请稍后再试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="vip-screen">
      <header className="vip-top">
        <Link href="/me" aria-label="返回我的">
          <ArrowLeft size={20} />
        </Link>
        <span className="vip-title">财富等级</span>
        <Crown className="text-amber-300" size={18} />
      </header>

      <div className="vip-card">
        <div className="vip-rank">{member ? member.status : "未解锁"}</div>
        <div className="vip-name">{currentTier?.name || "暂未开通"}</div>
        <div className="vip-progress">{progressText}</div>
        {member?.expiresAt ? (
          <div className="vip-progress">有效期至 {new Date(member.expiresAt).toLocaleDateString("zh-CN")}</div>
        ) : null}
      </div>

      <div className="vip-card" style={{ marginTop: 16 }}>
        <div className="vip-rank">可选等级</div>
        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          {tiers.length === 0 ? (
            <div className="vip-progress">暂无可用等级，请稍后再试。</div>
          ) : (
            tiers.map((tier) => (
              <button
                key={tier.id}
                type="button"
                onClick={() => setSelectedTierId(tier.id)}
                style={{
                  textAlign: "left",
                  padding: "12px 14px",
                  borderRadius: 14,
                  border: tier.id === selectedTier?.id ? "1px solid #fbbf24" : "1px solid rgba(255,255,255,0.08)",
                  background: tier.id === selectedTier?.id ? "rgba(251,191,36,0.12)" : "#0f1118",
                  color: "#e5e7eb",
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700 }}>{tier.name}</div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                  Lv.{tier.level} · {tier.durationDays ? `${tier.durationDays} 天` : "长期"} ·
                  {typeof tier.price === "number" ? ` ¥${tier.price}` : " 价格待定"}
                </div>
              </button>
            ))
          )}
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 6 }}>联系方式（方便审核联系）</div>
          <input
            value={contact}
            onChange={(event) => setContact(event.target.value)}
            placeholder="微信 / 手机"
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "#0f1118",
              color: "#e5e7eb",
              fontSize: 12,
            }}
          />
        </div>
        <button
          type="button"
          onClick={handleRequest}
          disabled={submitting}
          style={{
            marginTop: 12,
            width: "100%",
            padding: "10px 12px",
            borderRadius: 14,
            border: "none",
            background: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)",
            color: "#0f172a",
            fontWeight: 700,
          }}
        >
          {submitting ? "提交中..." : "申请开通"}
        </button>
        {hint ? <div className="vip-progress" style={{ marginTop: 8 }}>{hint}</div> : null}
      </div>

      <div className="vip-perks-title">贵族特权</div>
      <div className="vip-perks-grid">
        {perks.map((perk) => (
          <div key={perk.label} className="vip-perk">
            <div className="vip-perk-icon">
              <Shield size={16} />
            </div>
            <div className="vip-perk-text">
              <div className="vip-perk-label">{perk.label}</div>
              <div className="vip-perk-desc">{perk.desc || "会员专属权益"}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
