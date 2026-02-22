"use client";
import { t } from "@/lib/i18n/i18n-client";
import { Loader2 } from "lucide-react";
import { StateBlock } from "@/app/components/state-block";
import type { PublicPlayer } from "./schedule-data";

interface PlayerListProps {
  players: PublicPlayer[];
  playersLoading: boolean;
  playersError: string | null;
  selectedPlayerId: string;
  prefillHint: string | null;
  onSelectPlayer: (id: string) => void;
  onRefresh: () => void;
}

function renderLoadingLabel(loading: boolean, label: string, loadingLabel: string) {
  if (!loading) return label;
  return (
    <span className="inline-flex items-center gap-1">
      <Loader2 className="h-3.5 w-3.5 spin" />
      {loadingLabel}
    </span>
  );
}

export function PlayerList({
  players,
  playersLoading,
  playersError,
  selectedPlayerId,
  prefillHint,
  onSelectPlayer,
  onRefresh,
}: PlayerListProps) {
  return (
    <>
      <div className="ride-block-title">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>可接陪练</span>
          <button
            className="dl-tab-btn"
            style={{ padding: "4px 8px" }}
            onClick={onRefresh}
            type="button"
            disabled={playersLoading}
          >
            {renderLoadingLabel(playersLoading, t("schedule.034"), t("schedule.033"))}
          </button>
        </div>
      </div>
      <div className="ride-items">
        {playersLoading && players.length === 0 ? (
          <StateBlock
            tone="loading"
            size="compact"
            title={t("schedule.035")}
            description={t("schedule.036")}
          />
        ) : playersError && players.length === 0 ? (
          <StateBlock
            tone="danger"
            size="compact"
            title={t("schedule.037")}
            description={playersError}
            actions={
              <button
                className="dl-tab-btn"
                onClick={onRefresh}
                type="button"
                disabled={playersLoading}
              >
                {renderLoadingLabel(playersLoading, t("schedule.039"), t("schedule.038"))}
              </button>
            }
          />
        ) : players.length === 0 ? (
          <StateBlock
            tone="empty"
            size="compact"
            title={t("schedule.040")}
            description={t("schedule.041")}
          />
        ) : (
          players.map((player) => (
            <div
              key={player.id}
              className="ride-row"
              onClick={() => onSelectPlayer(player.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  onSelectPlayer(player.id);
                }
              }}
            >
              <div className="ride-row-main">
                <div className="ride-row-title">{player.name}</div>
                <div className="ride-row-desc">{player.role || "擅长位置待完善"}</div>
              </div>
              <div className="ride-row-side">
                <label className="ride-checkbox" onClick={(event) => event.stopPropagation()}>
                  <input
                    type="radio"
                    name="selected-player"
                    checked={selectedPlayerId === player.id}
                    onChange={() => onSelectPlayer(player.id)}
                  />
                  <span className="ride-checkbox-box" />
                </label>
              </div>
            </div>
          ))
        )}
        {playersError && players.length > 0 && (
          <div className="px-4 pb-2 text-xs text-rose-500">陪练列表更新失败：{playersError}</div>
        )}
      </div>
      <div className="px-4 pb-2 text-[11px] text-slate-400">
        {prefillHint || "未选择将由系统匹配陪练"}
      </div>
    </>
  );
}
