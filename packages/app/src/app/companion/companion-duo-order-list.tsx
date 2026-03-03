"use client";
import { Users } from "lucide-react";
import { StateBlock } from "@/app/components/state-block";
import { formatShortDateTime } from "@/lib/shared/date-utils";
import { releaseDuoSlot } from "@/lib/services/duo-order-service";
import { releaseDuoSlotOnChain } from "@/lib/chain/duo-chain";
import { isChainOrdersEnabled } from "@/lib/chain/qy-chain-lite";
import { useState } from "react";

type DuoOrderRow = Record<string, unknown>;

type Props = {
  orders: DuoOrderRow[];
  loading: boolean;
  address: string;
  onRefresh: () => void;
};

const TEAM_LABELS: Record<number, string> = {
  0: "等待组队",
  1: "A已缴押",
  2: "B已缴押",
  3: "双人就位",
};

export function CompanionDuoOrderList({ orders, loading, address, onRefresh }: Props) {
  const [releasing, setReleasing] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const handleRelease = async (orderId: string) => {
    if (releasing) return;
    if (!confirm("确定要释放此槽位吗？如已缴押金将自动退还。")) return;
    setReleasing(orderId);
    try {
      let chainDigest: string | undefined;
      if (isChainOrdersEnabled()) {
        const result = await releaseDuoSlotOnChain(orderId);
        chainDigest = result?.digest;
      }
      await releaseDuoSlot(orderId, address, chainDigest);
      setToast("槽位已释放");
      onRefresh();
    } catch (e) {
      setToast((e as Error).message || "释放失败");
    } finally {
      setReleasing(null);
      setTimeout(() => setToast(null), 3000);
    }
  };

  return (
    <section className="dl-card" style={{ padding: 16, marginTop: 12 }}>
      <div className="flex items-center gap-2 mb-3">
        <Users size={14} className="text-violet-500" />
        <span className="text-sm font-semibold text-gray-900">我的双陪订单</span>
      </div>
      {toast && <div className="text-xs text-amber-600 mb-2">{toast}</div>}
      {loading ? (
        <StateBlock tone="loading" size="compact" title="加载中…" />
      ) : orders.length === 0 ? (
        <StateBlock tone="empty" size="compact" title="暂无双陪订单" />
      ) : (
        <div className="grid gap-2">
          {orders.map((order) => {
            const id = String(order.id);
            const mySlot =
              order.companionAddressA === address
                ? "A"
                : order.companionAddressB === address
                  ? "B"
                  : null;
            const teamStatus = typeof order.teamStatus === "number" ? order.teamStatus : 0;
            return (
              <div key={id} className="rounded-xl border border-slate-100 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{String(order.item)}</span>
                    <span className="text-xs bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded">
                      双陪
                    </span>
                    {mySlot && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                        {mySlot}位
                      </span>
                    )}
                  </div>
                  <span className="text-sm font-bold text-amber-600">¥{String(order.amount)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
                  <span>
                    {String(order.stage)} · {TEAM_LABELS[teamStatus] || `team:${teamStatus}`}
                  </span>
                  <span>{formatShortDateTime(Number(order.createdAt))}</span>
                </div>
                {mySlot && String(order.stage) !== "已完成" && String(order.stage) !== "已取消" && (
                  <button
                    className="mt-2 text-xs text-red-500 hover:text-red-700"
                    onClick={() => handleRelease(id)}
                    disabled={releasing === id}
                  >
                    {releasing === id ? "释放中…" : "释放槽位"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
