"use client";
import { t } from "@/lib/i18n/i18n-client";
import { getChainDebugInfo } from "@/lib/chain/qy-chain";

interface DebugModalProps {
  onClose: () => void;
}

export function DebugModal({ onClose }: DebugModalProps) {
  return (
    <div className="ride-modal-mask" role="dialog" aria-modal="true" aria-label={t("schedule.032")}>
      <div className="ride-modal">
        <div className="ride-modal-head">
          <div>
            <div className="ride-modal-title">{t("ui.debug-modal.020")}</div>
            <div className="ride-modal-sub">{t("ui.debug-modal.021")}</div>
          </div>
          <div className="ride-modal-amount">Debug</div>
        </div>
        <div className="ride-qr-inline">
          <pre
            className="admin-input"
            style={{ width: "100%", minHeight: 140, whiteSpace: "pre-wrap", fontSize: 12 }}
          >
            {JSON.stringify(getChainDebugInfo(), null, 2)}
          </pre>
        </div>
        <div className="ride-modal-actions">
          <button className="dl-tab-btn" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
