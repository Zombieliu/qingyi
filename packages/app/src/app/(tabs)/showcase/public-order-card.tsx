"use client";
import { t } from "@/lib/i18n/t";
import { formatChainAmount as formatAmount } from "./showcase-utils";
import { MotionCard } from "@/components/ui/motion";
import { type LocalOrder } from "@/lib/services/order-store";
import { Clock3, Car, MapPin } from "lucide-react";

type Props = {
  order: LocalOrder;
  chainAddress: string;
  onCancel: (id: string) => void;
  onComplete: (id: string) => void;
  onConfirmDepositAccept: (id: string, depositLabel?: string) => void;
};

export function PublicOrderCard({
  order,
  chainAddress,
  onCancel,
  onComplete,
  onConfirmDepositAccept,
}: Props) {
  if (order.driver) {
    const profile = (order.meta?.gameProfile || null) as {
      gameName?: string;
      gameId?: string;
    } | null;
    const hasProfile = Boolean(profile?.gameName || profile?.gameId);

    return (
      <MotionCard
        className="dl-card"
        style={{ padding: 14, borderColor: "#fed7aa", background: "#fff7ed" }}
      >
        <div className="flex items-center gap-2 text-amber-600 text-sm font-semibold">
          <Car size={16} />
          陪练已接单
        </div>
        {hasProfile ? (
          <div className="mt-2 text-sm text-gray-900">
            <div className="font-bold">{t("ui.showcase.164")}</div>
            <div className="text-xs text-gray-500">
              游戏名 {profile?.gameName || "-"} · ID {profile?.gameId || "-"}
            </div>
          </div>
        ) : (
          <div className="mt-2 flex items-center gap-6 text-sm text-gray-900">
            <div>
              <div className="font-bold">{order.driver.name}</div>
              <div className="text-xs text-gray-500">{order.driver.car}</div>
            </div>
            <div className="text-right text-sm">
              <div className="font-semibold text-emerald-600">{order.driver.eta}</div>
              {order.driver.price && (
                <div className="text-xs text-gray-500">一口价 {order.driver.price} 钻石</div>
              )}
            </div>
          </div>
        )}
        <div className="mt-2 text-xs text-gray-500 flex items-center gap-2">
          <MapPin size={14} />
          服务信息
        </div>
        <div className="mt-2 text-xs">
          <span className="text-emerald-600 font-semibold mr-2">{t("ui.showcase.165")}</span>
          {order.playerPaid ? (
            <span className="text-emerald-700 font-semibold">{t("ui.showcase.166")}</span>
          ) : (
            <span className="text-red-500 font-semibold">{t("ui.showcase.167")}</span>
          )}
        </div>
        <div className="mt-3 flex items-center gap-10 text-sm">
          <div>
            <div className="text-gray-900">{order.item}</div>
            <div className="text-xs text-gray-500">订单号：{order.id}</div>
          </div>
          <div className="text-xs text-gray-500">{new Date(order.time).toLocaleString()}</div>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            className="dl-tab-btn"
            style={{ padding: "8px 10px" }}
            onClick={() => onCancel(order.id)}
          >
            取消订单
          </button>
          <button
            className="dl-tab-btn"
            style={{ padding: "8px 10px" }}
            onClick={() => onComplete(order.id)}
          >
            完成
          </button>
          <button className="dl-tab-btn accent" style={{ padding: "8px 10px" }}>
            联系陪练
          </button>
        </div>
      </MotionCard>
    );
  }

  return (
    <MotionCard className="dl-card" style={{ padding: 14 }}>
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-900">{order.item}</div>
        <div className="text-sm font-bold text-amber-600">¥{order.amount}</div>
      </div>
      <div className="mt-2 text-xs text-gray-500 flex items-center gap-2">
        <Clock3 size={14} />
        <span>{new Date(order.time).toLocaleString()}</span>
        <span className="text-amber-600 font-semibold">{t("ui.showcase.168")}</span>
      </div>
      <div className="mt-2 text-xs text-gray-500">
        状态：{order.status} · 撮合费
        {typeof order.serviceFee === "number"
          ? ` ¥${order.serviceFee.toFixed(2)}`
          : t("showcase.043")}
      </div>
      {order.userAddress && order.userAddress === chainAddress ? (
        <div className="mt-2 text-xs text-rose-500">{t("ui.showcase.169")}</div>
      ) : (
        <div className="mt-2 text-xs text-orange-600">{t("ui.showcase.170")}</div>
      )}
      <div className="mt-3 flex gap-2">
        <button
          className="dl-tab-btn"
          style={{ padding: "8px 10px" }}
          onClick={() =>
            onConfirmDepositAccept(
              order.id,
              typeof order.deposit === "number"
                ? `¥${formatAmount(String(order.deposit))}`
                : undefined
            )
          }
          disabled={Boolean(order.userAddress && order.userAddress === chainAddress)}
          title={
            order.userAddress && order.userAddress === chainAddress ? t("showcase.044") : undefined
          }
        >
          付押金并接单
        </button>
        <button
          className="dl-tab-btn"
          style={{ padding: "8px 10px" }}
          onClick={() => onCancel(order.id)}
        >
          取消
        </button>
      </div>
    </MotionCard>
  );
}
