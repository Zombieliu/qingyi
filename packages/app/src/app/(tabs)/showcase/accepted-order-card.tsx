"use client";
import { t } from "@/lib/i18n/t";
import { shortAddr } from "./showcase-utils";
import { MotionCard } from "@/components/ui/motion";
import { type LocalOrder } from "@/lib/services/order-store";

type Props = {
  order: LocalOrder;
  companionEnded: boolean;
  onEndService: (orderId: string) => void;
};

export function AcceptedOrderCard({ order, companionEnded, onEndService }: Props) {
  const gameProfile = (order.meta?.gameProfile || null) as {
    gameName?: string;
    gameId?: string;
  } | null;

  return (
    <MotionCard className="dl-card" style={{ padding: 14 }}>
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-900">{order.item}</div>
        <div className="text-sm font-bold text-amber-600">¥{order.amount}</div>
      </div>
      <div className="mt-2 text-xs text-gray-500">
        状态：{order.status} · 订单号：{order.id}
      </div>
      {order.userAddress ? (
        <div className="mt-2 text-xs text-gray-500">用户地址：{shortAddr(order.userAddress)}</div>
      ) : null}
      <div className="mt-2 text-xs text-gray-500">{new Date(order.time).toLocaleString()}</div>
      {gameProfile?.gameName || gameProfile?.gameId ? (
        <div className="mt-2 text-xs text-emerald-700">
          游戏名 {gameProfile?.gameName || "-"} · ID {gameProfile?.gameId || "-"}
        </div>
      ) : null}
      <div className="mt-3 flex gap-2 flex-wrap">
        <button
          className="dl-tab-btn"
          style={{ padding: "6px 10px" }}
          disabled={companionEnded}
          onClick={() => onEndService(order.id)}
        >
          {companionEnded ? t("tabs.showcase.i135") : t("showcase.040")}
        </button>
      </div>
    </MotionCard>
  );
}
