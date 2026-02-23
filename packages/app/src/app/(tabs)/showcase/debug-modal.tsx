"use client";
import { t } from "@/lib/i18n/t";
import { getChainDebugInfo } from "@/lib/chain/qy-chain";

export function DebugModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="ride-modal-mask" role="dialog" aria-modal="true" aria-label={t("showcase.048")}>
      <div className="ride-modal">
        <div className="ride-modal-head">
          <div>
            <div className="ride-modal-title">{t("ui.showcase.174")}</div>
            <div className="ride-modal-sub">{t("ui.showcase.175")}</div>
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
