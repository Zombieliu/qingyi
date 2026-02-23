"use client";
import { t } from "@/lib/i18n/t";
import { StateBlock } from "@/app/components/state-block";
import { formatShortDateTime } from "@/lib/shared/date-utils";

type CompanionOrder = {
  id: string;
  user: string;
  userAddress?: string;
  item: string;
  amount: number;
  stage: string;
  serviceFee?: number;
  createdAt: number;
  updatedAt: number | null;
  note?: string;
};

const STAGE_COLORS: Record<string, string> = {
  已支付: "bg-blue-50 text-blue-600",
  进行中: "bg-amber-50 text-amber-600",
  待结算: "bg-purple-50 text-purple-600",
  已完成: "bg-emerald-50 text-emerald-600",
  已取消: "bg-gray-100 text-gray-500",
  已退款: "bg-red-50 text-red-500",
};

type Props = {
  orders: CompanionOrder[];
  orderTab: "active" | "completed";
  ordersLoading: boolean;
  onTabChange: (tab: "active" | "completed") => void;
  onTagUser: (orderId: string, userAddress: string) => void;
};

export function CompanionOrderList({
  orders,
  orderTab,
  ordersLoading,
  onTabChange,
  onTagUser,
}: Props) {
  return (
    <section className="dl-card" style={{ padding: 16, marginTop: 12, marginBottom: 24 }}>
      <div className="flex items-center gap-3 mb-3">
        <button
          className={`lc-tab-btn ${orderTab === "active" ? "is-active" : ""}`}
          onClick={() => onTabChange("active")}
        >
          进行中
        </button>
        <button
          className={`lc-tab-btn ${orderTab === "completed" ? "is-active" : ""}`}
          onClick={() => onTabChange("completed")}
        >
          已完成
        </button>
      </div>
      {ordersLoading ? (
        <StateBlock tone="loading" size="compact" title={t("companion.i193")} />
      ) : orders.length === 0 ? (
        <StateBlock
          tone="empty"
          size="compact"
          title={orderTab === "active" ? t("companion.i194") : t("companion.i195")}
        />
      ) : (
        <div className="grid gap-2">
          {orders.map((order) => (
            <div key={order.id} className="rounded-xl border border-slate-100 p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-gray-900">{order.item}</div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STAGE_COLORS[order.stage] || "bg-gray-100 text-gray-500"}`}
                >
                  {order.stage}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
                <span>用户: {order.user || t("companion.i196")}</span>
                <span className="font-semibold text-gray-900">¥{order.amount}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] text-gray-400">
                <span>{formatShortDateTime(order.createdAt)}</span>
                {order.serviceFee ? <span>服务费 ¥{order.serviceFee}</span> : null}
              </div>
              {order.note && (
                <div className="mt-1 text-[10px] text-gray-400 truncate">备注: {order.note}</div>
              )}
              {order.userAddress && (
                <button
                  className="mt-1.5 text-[10px] text-orange-500 hover:text-orange-700"
                  onClick={() => onTagUser(order.id, order.userAddress!)}
                >
                  🏷️ 标记老板
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
