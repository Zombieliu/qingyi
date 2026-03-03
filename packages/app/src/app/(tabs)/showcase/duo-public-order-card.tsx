"use client";
import { MotionCard } from "@/components/ui/motion";
import { Clock3, Users } from "lucide-react";
import type { DuoOrder } from "@/lib/admin/admin-types";

type Props = {
  order: DuoOrder;
  chainAddress: string;
  onClaimSlot: (orderId: string) => void;
  onReleaseSlot?: (orderId: string) => void;
};

export function DuoPublicOrderCard({ order, chainAddress, onClaimSlot, onReleaseSlot }: Props) {
  const slotA = order.companionAddressA;
  const slotB = order.companionAddressB;
  const openSlots = [!slotA, !slotB].filter(Boolean).length;
  const isOwnOrder = order.userAddress === chainAddress;
  const alreadyClaimed = slotA === chainAddress || slotB === chainAddress;

  return (
    <MotionCard className="dl-card" style={{ padding: 14 }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-violet-500" />
          <span className="text-sm font-semibold text-gray-900">{order.item}</span>
          <span className="text-xs bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded">双陪</span>
        </div>
        <div className="text-sm font-bold text-amber-600">¥{order.amount}</div>
      </div>
      <div className="mt-2 text-xs text-gray-500 flex items-center gap-2">
        <Clock3 size={14} />
        <span>{new Date(order.createdAt).toLocaleString()}</span>
      </div>
      <div className="mt-2 text-xs text-gray-600">
        空位：{openSlots}/2
        {slotA && <span className="ml-2 text-emerald-600">A位已认领</span>}
        {slotB && <span className="ml-2 text-emerald-600">B位已认领</span>}
      </div>
      {order.serviceFee != null && (
        <div className="mt-1 text-xs text-gray-500">
          服务费 ¥{order.serviceFee.toFixed(2)}
          {order.depositPerCompanion != null &&
            order.depositPerCompanion > 0 &&
            ` · 每人押金 ¥${order.depositPerCompanion.toFixed(2)}`}
        </div>
      )}
      <div className="mt-3 flex gap-2">
        {alreadyClaimed && onReleaseSlot ? (
          <button
            className="dl-tab-btn"
            style={{ padding: "8px 10px" }}
            onClick={() => onReleaseSlot(order.id)}
          >
            释放槽位
          </button>
        ) : (
          <button
            className="dl-tab-btn accent"
            style={{ padding: "8px 10px" }}
            onClick={() => onClaimSlot(order.id)}
            disabled={isOwnOrder || alreadyClaimed || openSlots === 0}
            title={
              isOwnOrder
                ? "不能认领自己的订单"
                : alreadyClaimed
                  ? "已认领"
                  : openSlots === 0
                    ? "已满"
                    : undefined
            }
          >
            {alreadyClaimed ? "已认领" : "认领空位"}
          </button>
        )}
      </div>
    </MotionCard>
  );
}
