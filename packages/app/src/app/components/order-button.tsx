"use client";
import { useState } from "react";
import { createOrder } from "./order-service";
import {
  createChainOrderId,
  createOrderOnChain,
  getCurrentAddress,
  isChainOrdersEnabled,
} from "@/lib/qy-chain";
import { trackEvent } from "@/app/components/analytics";

interface Props {
  user: string;
  item: string;
  amount: number;
  note?: string;
}

const GAME_PROFILE_KEY = "qy_game_profile_v1";

type GameProfile = {
  gameName: string;
  gameId: string;
  updatedAt: number;
  userAddress?: string;
};

type StoredProfiles = Record<string, GameProfile>;

function loadGameProfile(address: string) {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(GAME_PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredProfiles;
    return parsed[address] || parsed.local || null;
  } catch {
    return null;
  }
}

export default function OrderButton({ user, item, amount, note }: Props) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async () => {
    try {
      setLoading(true);
      setMsg(null);
      trackEvent("order_intent", { source: "home_card", user, item, amount });
      let chainOrderId: string | null = null;
      let chainDigest: string | null = null;
      if (isChainOrdersEnabled()) {
        chainOrderId = createChainOrderId();
        const chainResult = await createOrderOnChain({
          orderId: chainOrderId,
          serviceFee: amount,
          deposit: 0,
          autoPay: true,
        });
        chainDigest = chainResult.digest;
      }
      const currentAddress = isChainOrdersEnabled() ? getCurrentAddress() : "";
      const gameProfile = currentAddress ? loadGameProfile(currentAddress) : null;
      const result = await createOrder({
        id: chainOrderId || `${Date.now()}`,
        user,
        userAddress: currentAddress || undefined,
        item,
        amount,
        status: "已支付",
        time: new Date().toISOString(),
        chainDigest: chainDigest || undefined,
        note,
        meta: {
          publicPool: true,
          gameProfile: gameProfile
            ? { gameName: gameProfile.gameName, gameId: gameProfile.gameId, updatedAt: gameProfile.updatedAt }
            : null,
        },
      });
      if (result.sent === false) {
        trackEvent("order_create_failed", {
          source: "home_card",
          user,
          item,
          amount,
          reason: result.error || "notify_failed",
        });
        setMsg(result.error || "订单已创建，通知失败");
      } else {
        trackEvent("order_create_success", { source: "home_card", user, item, amount });
        setMsg(chainDigest ? "已提交并同步到微信群" : "已同步到微信群");
      }
    } catch (e) {
      trackEvent("order_create_failed", { source: "home_card", user, item, amount, reason: "exception" });
      setMsg((e as Error).message || "下单失败");
    } finally {
      setLoading(false);
      setTimeout(() => setMsg(null), 3000);
    }
  };

  return (
    <button
      onClick={submit}
      disabled={loading}
      className="lc-order"
      aria-label={`为 ${user} 下单 ${item}`}
    >
      {loading ? "发送中..." : "自助下单"}
      {msg && <span className="lc-order-tip">{msg}</span>}
    </button>
  );
}
