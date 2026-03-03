"use client";
import { t } from "@/lib/i18n/t";
import { Clock3, QrCode, Users } from "lucide-react";
import {
  type PublicPlayer,
  sections,
  FIRST_ORDER_DISCOUNT,
  PLAYER_SECTION_TITLE,
} from "./schedule-data";
import { PlayerList } from "./player-list";

type Props = {
  checked: Record<string, boolean>;
  active: string;
  infoOpen: string | null;
  toast: string | null;
  pickedPrice: number;
  pickedDiamonds: number;
  firstOrderEligible: boolean;
  players: PublicPlayer[];
  playersLoading: boolean;
  playersError: string | null;
  selectedPlayerId: string;
  prefillHint: string | null;
  onSectionRef: (key: string, el: HTMLDivElement | null) => void;
  onToggle: (name: string) => void;
  onSetActive: (title: string) => void;
  onSetInfoOpen: (name: string | null) => void;
  onSelectPlayer: (id: string) => void;
  onRefreshPlayers: () => void;
  onSubmit: () => void;
  onSubmitDuo: () => void;
  onScrollToSection: (key: string) => void;
};

export function ScheduleSelectView(props: Props) {
  const {
    checked,
    active,
    infoOpen,
    toast,
    pickedPrice,
    pickedDiamonds,
    firstOrderEligible,
    players,
    playersLoading,
    playersError,
    selectedPlayerId,
    prefillHint,
    onSectionRef,
    onToggle,
    onSetActive,
    onSetInfoOpen,
    onSelectPlayer,
    onRefreshPlayers,
    onSubmit,
    onSubmitDuo,
    onScrollToSection,
  } = props;

  return (
    <>
      <div className="ride-tip" style={{ marginTop: 0 }}>
        本单含多种特惠计价，点击查看详情
      </div>

      <div className="ride-content">
        <div className="ride-side">
          <button
            className={`ride-side-tab ${active === PLAYER_SECTION_TITLE ? "is-active" : ""}`}
            onClick={() => {
              onSetActive(PLAYER_SECTION_TITLE);
              onScrollToSection(PLAYER_SECTION_TITLE);
            }}
          >
            可接陪练
          </button>
          {sections.map((s) => (
            <button
              key={s.title}
              className={`ride-side-tab ${active === s.title ? "is-active" : ""}`}
              onClick={() => {
                onSetActive(s.title);
                onScrollToSection(s.title);
              }}
            >
              {s.title}
            </button>
          ))}
        </div>

        <div className="ride-main">
          <div className="ride-sections motion-stack">
            <div ref={(el) => onSectionRef(PLAYER_SECTION_TITLE, el)} className="ride-block">
              <PlayerList
                players={players}
                playersLoading={playersLoading}
                playersError={playersError}
                selectedPlayerId={selectedPlayerId}
                prefillHint={prefillHint}
                onSelectPlayer={onSelectPlayer}
                onRefresh={onRefreshPlayers}
              />
            </div>
            {sections.map((section) => (
              <div
                key={section.title}
                ref={(el) => onSectionRef(section.title, el)}
                className={`ride-block ${section.highlight ? "is-highlight" : ""}`}
              >
                <div className="ride-block-title">
                  <span>{section.title}</span>
                  {section.badge && <span className="ride-badge">{section.badge}</span>}
                </div>
                <div className="ride-items">
                  {section.items.map((item) => (
                    <div key={item.name} className="ride-row">
                      <div className="ride-row-main">
                        <div className="ride-row-title">
                          {item.name}
                          {item.tag && <span className="ride-tag">{item.tag}</span>}
                        </div>
                        <div className="ride-row-desc">{item.desc}</div>
                        <div className="ride-row-eta">
                          <Clock3 size={14} />
                          <span>{item.eta}</span>
                        </div>
                      </div>
                      <div className="ride-row-side">
                        <div className="ride-row-price">
                          <span className={item.bold ? "bold" : ""}>{item.price}</span>
                          {item.old && <span className="ride-old">{item.old}</span>}
                        </div>
                        {item.info && (
                          <div className="ride-info">
                            <button
                              type="button"
                              className="ride-info-dot"
                              onClick={() =>
                                onSetInfoOpen(infoOpen === item.name ? null : item.name)
                              }
                              onMouseEnter={() => onSetInfoOpen(item.name)}
                              onMouseLeave={() => onSetInfoOpen(null)}
                              aria-label={item.info}
                            >
                              !
                            </button>
                            {infoOpen === item.name && (
                              <div className="ride-tooltip">{item.info}</div>
                            )}
                          </div>
                        )}
                        <label className="ride-checkbox">
                          <input
                            type="checkbox"
                            checked={!!checked[item.name]}
                            onChange={() => onToggle(item.name)}
                          />
                          <span className="ride-checkbox-box" />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <footer className="ride-footer">
        <div className="ride-footer-left">
          <div className="ride-range">
            预估价 {pickedPrice ? pickedDiamonds.toFixed(0) : "40-90"} 钻石
          </div>
          <div className="ride-extra">{t("ui.schedule.043")}</div>
          {firstOrderEligible && (
            <div className="ride-discount-tag">{FIRST_ORDER_DISCOUNT.label}</div>
          )}
        </div>
        <div className="flex gap-2">
          <button className="ride-call" onClick={onSubmit}>
            <QrCode size={16} style={{ marginRight: 6 }} />
            先托管再呼叫
          </button>
          <button className="ride-call" style={{ background: "#7c3aed" }} onClick={onSubmitDuo}>
            <Users size={16} style={{ marginRight: 6 }} />
            双陪下单
          </button>
        </div>
      </footer>
      {toast && <div className="ride-toast">{toast}</div>}
    </>
  );
}
