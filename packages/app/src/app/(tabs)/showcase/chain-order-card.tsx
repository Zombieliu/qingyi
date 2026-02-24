"use client";
import { t } from "@/lib/i18n/t";
import {
  formatChainAmount as formatAmount,
  formatChainTime as formatTime,
  formatRemaining,
  shortAddr,
  chainStatusLabel as statusLabel,
} from "./showcase-utils";
import { MotionCard } from "@/components/ui/motion";
import { type ChainOrder } from "@/lib/chain/qy-chain";

type Props = {
  order: ChainOrder;
  chainAddress: string;
  effectiveStatus: number;
  deadline: number;
  meta: Record<string, unknown> | null;
  metaLoading: boolean;
  copiedOrderId: string | null;
  chainAction: string | null;
  isUser: boolean;
  isCompanion: boolean;
  companionEnded: boolean;
  canDispute: boolean;
  canFinalize: boolean;
  onAcceptDeposit: () => void;
  onEndService: () => void;
  onMarkCompleted: () => void;
  onPay: () => void;
  onCancel: () => void;
  onDispute: () => void;
  onFinalize: () => void;
  onCopyGameProfile: (profile: { gameName?: string; gameId?: string }) => void;
  onHydrateMeta: () => void;
  renderActionLabel: (key: string, label: string) => React.ReactNode;
};

export function ChainOrderCard({
  order,
  effectiveStatus,
  deadline,
  meta,
  metaLoading,
  copiedOrderId,
  chainAction,
  isUser,
  isCompanion,
  companionEnded,
  canDispute,
  canFinalize,
  onAcceptDeposit,
  onEndService,
  onMarkCompleted,
  onPay,
  onCancel,
  onDispute,
  onFinalize,
  onCopyGameProfile,
  onHydrateMeta,
  renderActionLabel,
}: Props) {
  const gameProfile = (meta?.gameProfile || null) as {
    gameName?: string;
    gameId?: string;
  } | null;

  return (
    <MotionCard className="dl-card" style={{ padding: 14 }}>
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-900">订单 #{order.orderId}</div>
        <div className="text-sm font-bold text-amber-600">¥{formatAmount(order.serviceFee)}</div>
      </div>
      <div className="mt-2 text-xs text-gray-500">
        用户 {shortAddr(order.user)} · 陪玩 {shortAddr(order.companion)}
      </div>
      {isCompanion && effectiveStatus >= 2 && (
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-emerald-700">
          <span>
            {gameProfile?.gameName && gameProfile?.gameId
              ? `游戏名 ${gameProfile.gameName} · ID ${gameProfile.gameId}`
              : t("ui.showcase.635")}
          </span>
          <div className="flex items-center gap-2">
            {gameProfile?.gameName && gameProfile?.gameId ? (
              <>
                {copiedOrderId === order.orderId && (
                  <span className="text-[11px] text-emerald-600" aria-live="polite">
                    已复制
                  </span>
                )}
                <button
                  type="button"
                  className="dl-tab-btn"
                  style={{
                    padding: "4px 10px",
                    borderColor: "#34d399",
                    background: "#ecfdf5",
                    color: "#059669",
                  }}
                  onClick={() => onCopyGameProfile(gameProfile)}
                >
                  复制
                </button>
              </>
            ) : (
              <button
                type="button"
                className="dl-tab-btn"
                style={{
                  padding: "4px 10px",
                  borderColor: "#fde68a",
                  background: "#fffbeb",
                  color: "#b45309",
                }}
                onClick={onHydrateMeta}
                disabled={metaLoading}
              >
                {metaLoading ? t("ui.showcase.551") : t("showcase.030")}
              </button>
            )}
          </div>
        </div>
      )}
      <div className="mt-2 text-xs text-gray-500">
        状态：{statusLabel(effectiveStatus)} · 押金 ¥{formatAmount(order.deposit)}
      </div>
      <div className="mt-2 text-xs text-gray-500">
        创建时间：{formatTime(order.createdAt)} · 争议截止：
        {formatTime(String(deadline || 0))}
      </div>
      {effectiveStatus === 3 && (
        <div className="mt-1 text-xs text-amber-700">
          争议剩余：{formatRemaining(String(deadline || 0))}
        </div>
      )}
      <div className="mt-3 flex gap-2 flex-wrap">
        {isUser && effectiveStatus === 0 && (
          <button
            className="dl-tab-btn"
            style={{ padding: "8px 10px" }}
            disabled={chainAction === `pay-${order.orderId}`}
            onClick={onPay}
          >
            {renderActionLabel(`pay-${order.orderId}`, t("showcase.031"))}
          </button>
        )}
        {isUser && (effectiveStatus === 0 || effectiveStatus === 1) && (
          <button
            className="dl-tab-btn"
            style={{ padding: "8px 10px" }}
            disabled={chainAction === `cancel-${order.orderId}`}
            onClick={onCancel}
          >
            {renderActionLabel(`cancel-${order.orderId}`, t("showcase.032"))}
          </button>
        )}
        {isCompanion && effectiveStatus === 1 && (
          <button
            className="dl-tab-btn"
            style={{ padding: "8px 10px" }}
            disabled={chainAction === `deposit-${order.orderId}`}
            onClick={onAcceptDeposit}
          >
            {renderActionLabel(`deposit-${order.orderId}`, t("showcase.035"))}
          </button>
        )}
        {isCompanion && effectiveStatus === 2 && (
          <button
            className="dl-tab-btn"
            style={{ padding: "8px 10px" }}
            disabled={companionEnded}
            onClick={onEndService}
          >
            {companionEnded ? t("tabs.showcase.i133") : t("showcase.036")}
          </button>
        )}
        {isUser && effectiveStatus === 2 && (
          <button
            className="dl-tab-btn"
            style={{ padding: "8px 10px" }}
            disabled={chainAction === `complete-${order.orderId}`}
            onClick={onMarkCompleted}
          >
            {renderActionLabel(`complete-${order.orderId}`, t("showcase.037"))}
          </button>
        )}
        {(isUser || isCompanion) && canDispute && (
          <button
            className="dl-tab-btn"
            style={{ padding: "8px 10px" }}
            disabled={chainAction === `dispute-${order.orderId}`}
            onClick={onDispute}
          >
            {renderActionLabel(`dispute-${order.orderId}`, t("showcase.038"))}
          </button>
        )}
        {(isUser || isCompanion) && canFinalize && (
          <button
            className="dl-tab-btn"
            style={{ padding: "8px 10px" }}
            disabled={chainAction === `finalize-${order.orderId}`}
            onClick={onFinalize}
          >
            {renderActionLabel(`finalize-${order.orderId}`, t("showcase.039"))}
          </button>
        )}
      </div>
    </MotionCard>
  );
}
