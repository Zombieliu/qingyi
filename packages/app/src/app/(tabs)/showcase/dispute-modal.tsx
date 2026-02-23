"use client";
import { t } from "@/lib/i18n/t";
import { formatChainTime as formatTime, formatRemaining } from "./showcase-utils";
import { type ChainOrder } from "@/lib/chain/qy-chain";

type Props = {
  disputeOpen: { orderId: string; evidence: string };
  disputeOrder: ChainOrder | null;
  disputeDeadline: number;
  onClose: () => void;
  onSubmit: (orderId: string, evidence: string) => void;
  onChangeEvidence: (evidence: string) => void;
};

export function DisputeModal({
  disputeOpen,
  disputeOrder,
  disputeDeadline,
  onClose,
  onSubmit,
  onChangeEvidence,
}: Props) {
  return (
    <div className="ride-modal-mask" role="dialog" aria-modal="true" aria-label={t("showcase.046")}>
      <div className="ride-modal">
        <div className="ride-modal-head">
          <div>
            <div className="ride-modal-title">{t("ui.showcase.172")}</div>
            <div className="ride-modal-sub">{t("ui.showcase.173")}</div>
          </div>
          <div className="ride-modal-amount">#{disputeOpen.orderId}</div>
        </div>
        <div className="ride-modal-body">
          <textarea
            className="dl-textarea"
            placeholder={t("showcase.047")}
            value={disputeOpen.evidence}
            onChange={(e) => onChangeEvidence(e.target.value)}
          />
          {disputeOrder?.disputeDeadline ? (
            <div className="text-xs text-gray-500">
              争议截止：{formatTime(String(disputeDeadline || 0))}（剩余{" "}
              {formatRemaining(String(disputeDeadline || 0))}）
            </div>
          ) : null}
        </div>
        <div className="ride-modal-actions">
          <button className="dl-tab-btn" onClick={onClose}>
            取消
          </button>
          <button
            className="dl-tab-btn primary"
            onClick={() => onSubmit(disputeOpen.orderId, disputeOpen.evidence.trim())}
          >
            提交争议
          </button>
        </div>
      </div>
    </div>
  );
}
