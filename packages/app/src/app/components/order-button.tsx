"use client";
import { t } from "@/lib/i18n/i18n-client";
import { useState } from "react";
import { createOrder } from "@/lib/services/order-service";
import {
  createChainOrderId,
  createOrderOnChain,
  getCurrentAddress,
  isChainOrdersEnabled,
} from "@/lib/chain/qy-chain";
import { trackEvent } from "@/lib/services/analytics";
import { classifyChainError } from "@/lib/chain/chain-error";
import { Button } from "@/components/ui/button";
import { StateBlock } from "@/app/components/state-block";
import { formatErrorMessage } from "@/lib/shared/error-utils";
import { GAME_PROFILE_KEY } from "@/lib/shared/constants";

interface Props {
  user: string;
  item: string;
  amount: number;
  note?: string;
}

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
  const [status, setStatus] = useState<{
    tone: "success" | "warning" | "danger" | "info";
    title: string;
  } | null>(null);

  const submit = async () => {
    try {
      setLoading(true);
      setStatus(null);
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
            ? {
                gameName: gameProfile.gameName,
                gameId: gameProfile.gameId,
                updatedAt: gameProfile.updatedAt,
              }
            : null,
        },
      });
      if (chainOrderId) {
        const address = getCurrentAddress();
        const retrySync = async () => {
          const delays = [1000, 2000, 4000, 8000];
          let synced = false;
          for (const delay of delays) {
            try {
              const res = await fetch(
                `/api/orders/${chainOrderId}/chain-sync?force=1&maxWaitMs=15000`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ userAddress: address, digest: chainDigest }),
                }
              );
              if (res.ok) {
                synced = true;
                break;
              }
            } catch {
              // retry
            }
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
          if (!synced) {
            setStatus({ tone: "warning", title: "链上同步失败，订单已创建，稍后会自动重试" });
            trackEvent("chain_sync_failed", { orderId: chainOrderId, source: "home_card" });
          }
        };
        void retrySync();
      }
      if (result.sent === false) {
        trackEvent("order_create_failed", {
          source: "home_card",
          user,
          item,
          amount,
          reason: result.error || "notify_failed",
        });
        setStatus({ tone: "warning", title: result.error || "订单已创建，通知失败" });
      } else {
        trackEvent("order_create_success", { source: "home_card", user, item, amount });
        setStatus({
          tone: "success",
          title: chainDigest ? t("ui.order-button.581") : t("comp.order_button.001"),
        });
      }
    } catch (e) {
      trackEvent("order_create_failed", {
        source: "home_card",
        user,
        item,
        amount,
        reason: "exception",
      });
      const errInfo = classifyChainError(e);
      setStatus({ tone: "danger", title: `${errInfo.title}：${errInfo.message}` });
    } finally {
      setLoading(false);
      setTimeout(() => setStatus(null), 3000);
    }
  };

  return (
    <div className="lc-order-wrap">
      <Button
        variant="ghost"
        size="unstyled"
        onClick={submit}
        disabled={loading}
        className="lc-order"
        aria-label={`为 ${user} 下单 ${item}`}
      >
        {loading ? t("ui.order-button.560") : t("comp.order_button.002")}
      </Button>
      {status && (
        <div className="lc-order-state">
          <StateBlock tone={status.tone} size="compact" align="center" title={status.title} />
        </div>
      )}
    </div>
  );
}
