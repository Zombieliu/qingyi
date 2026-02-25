"use client";
import { t } from "@/lib/i18n/t";
import { StateBlock } from "@/app/components/state-block";
import { useGuardianStatus } from "@/app/components/guardian-role";
import { PLAYER_STATUS_OPTIONS, type PlayerStatus } from "@/lib/admin/admin-types";

export function PlayerStatusSection({
  guardianState,
  guardianAddress,
  isGuardian,
  playerStatus,
  statusLoading,
  statusSaving,
  statusHint,
  statusHintTone,
  onUpdateStatus,
}: {
  guardianState: string;
  guardianAddress: string | null;
  isGuardian: boolean;
  playerStatus: PlayerStatus | null;
  statusLoading: boolean;
  statusSaving: boolean;
  statusHint: string | null;
  statusHintTone: "success" | "warning";
  onUpdateStatus: (status: PlayerStatus) => void;
}) {
  return (
    <section className="dl-card" style={{ padding: 16, marginTop: 12 }}>
      <div className="text-sm font-semibold text-gray-900">{t("ui.mantou.091")}</div>
      <div className="mt-2 text-xs text-slate-500">{t("ui.mantou.092")}</div>
      {guardianState === "checking" || statusLoading ? (
        <div className="mt-3">
          <StateBlock tone="loading" size="compact" title={t("me.mantou.004")} />
        </div>
      ) : !guardianAddress ? (
        <div className="mt-3">
          <StateBlock
            tone="warning"
            size="compact"
            title={t("me.mantou.005")}
            description={t("me.mantou.006")}
          />
        </div>
      ) : !isGuardian ? (
        <div className="mt-3">
          <StateBlock
            tone="warning"
            size="compact"
            title={t("me.mantou.007")}
            description={t("me.mantou.008")}
          />
        </div>
      ) : playerStatus ? (
        <div className="mt-3">
          <div className="text-xs text-slate-500">当前状态：{playerStatus}</div>
          <div className="lc-tabs" style={{ marginTop: 8 }}>
            {PLAYER_STATUS_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                className={`lc-tab-btn ${playerStatus === option ? "is-active" : ""}`}
                onClick={() => onUpdateStatus(option)}
                disabled={statusSaving || playerStatus === option}
              >
                {statusSaving && playerStatus === option ? t("tabs.me.mantou.i051") : option}
              </button>
            ))}
          </div>
          {statusHint && (
            <div className="mt-3">
              <StateBlock tone={statusHintTone} size="compact" title={t(statusHint)} />
            </div>
          )}
        </div>
      ) : (
        <div className="mt-3">
          <StateBlock
            tone="warning"
            size="compact"
            title={statusHint ? t(statusHint) : t("tabs.me.mantou.i052")}
            description={t("me.mantou.009")}
          />
        </div>
      )}
    </section>
  );
}
