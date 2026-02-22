"use client";
import { t } from "@/lib/i18n/i18n-client";
import { Loader2, CheckCircle2 } from "lucide-react";
import { FIRST_ORDER_DISCOUNT } from "./schedule-data";
import type { PublicPlayer } from "./schedule-data";

interface FeeModalProps {
  locked: {
    total: number;
    originalTotal: number;
    discount: number;
    service: number;
    player: number;
    items: string[];
  };
  requiredDiamonds: number;
  diamondRate: number;
  diamondBalance: string;
  balanceLoading: boolean;
  balanceReady: boolean;
  hasEnoughDiamonds: boolean;
  feeChecked: boolean;
  setFeeChecked: (checked: boolean) => void;
  calling: boolean;
  vipLoading: boolean;
  vipTier: { level?: number; name?: string } | null;
  disputePolicy: { hours: number; ruleSetId: string };
  selectedPlayer: PublicPlayer | null;
  refreshBalance: () => Promise<void>;
  callOrder: () => Promise<void>;
  onClose: () => void;
}

export function FeeModal({
  locked,
  requiredDiamonds,
  diamondRate,
  diamondBalance,
  balanceLoading,
  balanceReady,
  hasEnoughDiamonds,
  feeChecked,
  setFeeChecked,
  calling,
  vipLoading,
  vipTier,
  disputePolicy,
  selectedPlayer,
  refreshBalance,
  callOrder,
  onClose,
}: FeeModalProps) {
  const renderLoadingLabel = (loading: boolean, label: string, loadingLabel: string) => {
    if (!loading) return label;
    return (
      <span className="inline-flex items-center gap-1">
        <Loader2 className="h-3.5 w-3.5 spin" />
        {loadingLabel}
      </span>
    );
  };

  return (
    <div className="ride-modal-mask" role="dialog" aria-modal="true">
      <div className="ride-modal">
        <div className="ride-modal-head">
          <div>
            <div className="ride-modal-title">{t("ui.fee-modal.022")}</div>
            <div className="ride-modal-sub">{t("ui.fee-modal.023")}</div>
          </div>
          <div className="ride-modal-amount">{requiredDiamonds} 钻石</div>
        </div>
        <div className="ride-qr-inline">
          <div className="ride-qr-text">
            <div className="text-sm font-semibold text-gray-900">{t("ui.fee-modal.024")}</div>
            <div className="text-xs text-gray-500">
              订单 ¥{locked.total.toFixed(2)} × {diamondRate} = {requiredDiamonds} 钻石
            </div>
            {locked.discount > 0 && (
              <div className="ride-price-stack">
                <div className="ride-price-line">
                  <span>{t("ui.fee-modal.025")}</span>
                  <span>¥{locked.originalTotal.toFixed(2)}</span>
                </div>
                <div className="ride-price-line discount">
                  <span>{FIRST_ORDER_DISCOUNT.label}</span>
                  <span>-¥{locked.discount.toFixed(2)}</span>
                </div>
                <div className="ride-price-line total">
                  <span>{t("ui.fee-modal.026")}</span>
                  <span>¥{locked.total.toFixed(2)}</span>
                </div>
              </div>
            )}
            <div className="text-xs text-gray-500" style={{ marginTop: 4 }}>
              撮合费 ¥{locked.service.toFixed(2)} / 陪练费用 ¥{locked.player.toFixed(2)}
            </div>
            <div className="ride-chip">{t("ui.fee-modal.027")}</div>
            <div className="text-xs text-gray-500" style={{ marginTop: 4 }}>
              仲裁时效：{vipLoading ? "查询中..." : `${disputePolicy.hours}小时`}
              {vipTier?.name ? `（会员：${vipTier.name}）` : ""}
            </div>
            <div className="text-xs text-gray-500" style={{ marginTop: 4 }}>
              已选陪练：
              {selectedPlayer
                ? `${selectedPlayer.name}${selectedPlayer.role ? `（${selectedPlayer.role}）` : ""}`
                : t("ui.fee-modal.643")}
            </div>
            <div className="text-xs text-gray-500" style={{ marginTop: 6 }}>
              当前余额：
              {balanceLoading
                ? t("schedule.028")
                : balanceReady
                  ? `${diamondBalance} 钻石`
                  : t("ui.fee-modal.632")}
            </div>
            {balanceReady && !hasEnoughDiamonds && (
              <div className="text-xs text-rose-500" style={{ marginTop: 4 }}>
                钻石余额不足，请先充值
              </div>
            )}
            <button
              className="dl-tab-btn"
              style={{ marginTop: 8 }}
              onClick={refreshBalance}
              disabled={balanceLoading}
            >
              {renderLoadingLabel(balanceLoading, t("schedule.030"), t("schedule.029"))}
            </button>
            <label className="ride-status-toggle" style={{ marginTop: 10 }}>
              <input
                type="checkbox"
                checked={feeChecked}
                onChange={(e) => setFeeChecked(e.target.checked)}
                aria-label={t("schedule.031")}
              />
              <span>{t("ui.fee-modal.028")}</span>
              {feeChecked && <CheckCircle2 size={16} color="#22c55e" />}
            </label>
          </div>
        </div>
        <div className="ride-modal-actions">
          <button className="dl-tab-btn" onClick={onClose}>
            取消
          </button>
          <button
            className="dl-tab-btn primary"
            onClick={callOrder}
            disabled={calling || !hasEnoughDiamonds}
          >
            {calling ? <Loader2 size={16} className="spin" /> : null}
            <span style={{ marginLeft: calling ? 6 : 0 }}>{t("ui.fee-modal.029")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
