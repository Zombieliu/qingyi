"use client";
import { t } from "@/lib/i18n/t";
import type { AdminMembershipTier, MembershipTierStatus } from "@/lib/admin/admin-types";
import { MEMBERSHIP_TIER_STATUS_OPTIONS } from "@/lib/admin/admin-types";
import { StateBlock } from "@/app/components/state-block";

type Props = {
  tiers: AdminMembershipTier[];
  perksDraft: Record<string, string>;
  saving: Record<string, boolean>;
  page: number;
  nextCursor: string | null;
  prevCursors: (string | null)[];
  totalActive: number;
  setTiers: React.Dispatch<React.SetStateAction<AdminMembershipTier[]>>;
  setPerksDraft: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  updateTier: (id: string, data: Record<string, unknown>) => void;
  goNext: () => void;
  goPrev: () => void;
  parsePerks: (text: string) => { label: string; desc?: string }[];
};

export function VipTiersTable({
  tiers,
  perksDraft,
  saving,
  page,
  nextCursor,
  prevCursors,
  totalActive,
  setTiers,
  setPerksDraft,
  updateTier,
  goNext,
  goPrev,
}: Props) {
  return (
    <div className="admin-card">
      <div className="admin-card-header">
        <h3>{t("ui.vip.205")}</h3>
        <div className="admin-card-actions">
          <span className="admin-pill">上架 {totalActive} 个</span>
        </div>
      </div>
      {tiers.length === 0 ? (
        <StateBlock
          tone="empty"
          size="compact"
          title={t("admin.vip.007")}
          description={t("admin.vip.008")}
        />
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t("ui.vip.209")}</th>
                <th>{t("ui.vip.210")}</th>
                <th>{t("ui.vip.211")}</th>
                <th>{t("ui.vip.212")}</th>
                <th>{t("ui.vip.213")}</th>
                <th>{t("ui.vip.214")}</th>
                <th>{t("ui.vip.215")}</th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((tier) => (
                <tr key={tier.id}>
                  <td data-label={t("admin.vip.009")}>
                    <div className="admin-text-strong">{tier.name}</div>
                    <div className="admin-meta">Lv.{tier.level}</div>
                  </td>
                  <td data-label={t("admin.vip.010")}>
                    <input
                      className="admin-input"
                      value={tier.price ?? ""}
                      onChange={(e) =>
                        setTiers((prev) =>
                          prev.map((item) =>
                            item.id === tier.id
                              ? {
                                  ...item,
                                  price: e.target.value ? Number(e.target.value) : undefined,
                                }
                              : item
                          )
                        )
                      }
                      onBlur={(e) =>
                        updateTier(tier.id, {
                          price: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                    />
                  </td>
                  <td data-label={t("admin.vip.011")}>
                    <input
                      className="admin-input"
                      value={tier.durationDays ?? ""}
                      onChange={(e) =>
                        setTiers((prev) =>
                          prev.map((item) =>
                            item.id === tier.id
                              ? {
                                  ...item,
                                  durationDays: e.target.value ? Number(e.target.value) : undefined,
                                }
                              : item
                          )
                        )
                      }
                      onBlur={(e) =>
                        updateTier(tier.id, {
                          durationDays: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                    />
                  </td>
                  <td data-label={t("admin.vip.012")}>
                    <input
                      className="admin-input"
                      value={tier.minPoints ?? ""}
                      onChange={(e) =>
                        setTiers((prev) =>
                          prev.map((item) =>
                            item.id === tier.id
                              ? {
                                  ...item,
                                  minPoints: e.target.value ? Number(e.target.value) : undefined,
                                }
                              : item
                          )
                        )
                      }
                      onBlur={(e) =>
                        updateTier(tier.id, {
                          minPoints: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                    />
                  </td>
                  <td data-label={t("admin.vip.013")}>
                    <select
                      className="admin-select"
                      value={tier.status}
                      onChange={(e) => {
                        const nextStatus = e.target.value as MembershipTierStatus;
                        setTiers((prev) =>
                          prev.map((item) =>
                            item.id === tier.id ? { ...item, status: nextStatus } : item
                          )
                        );
                        updateTier(tier.id, { status: nextStatus });
                      }}
                    >
                      {MEMBERSHIP_TIER_STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td data-label={t("admin.vip.014")}>
                    <textarea
                      className="admin-textarea"
                      value={perksDraft[tier.id] ?? ""}
                      onChange={(e) =>
                        setPerksDraft((prev) => ({ ...prev, [tier.id]: e.target.value }))
                      }
                      onBlur={(e) =>
                        updateTier(tier.id, {
                          perks: e.target.value
                            .split(/\r?\n/)
                            .map((l) => l.trim())
                            .filter(Boolean)
                            .map((line) => {
                              const [label, ...rest] = line.split("|");
                              const desc = rest.join("|").trim();
                              return desc ? { label: label.trim(), desc } : { label: label.trim() };
                            }),
                        })
                      }
                    />
                  </td>
                  <td data-label={t("admin.vip.015")}>
                    <span className="admin-badge neutral">
                      {saving[tier.id] ? t("ui.vip.520") : t("admin.vip.016")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="admin-pagination">
        <button className="admin-btn ghost" disabled={prevCursors.length === 0} onClick={goPrev}>
          上一页
        </button>
        <div className="admin-meta">第 {page} 页</div>
        <button className="admin-btn ghost" disabled={!nextCursor} onClick={goNext}>
          下一页
        </button>
      </div>
    </div>
  );
}
