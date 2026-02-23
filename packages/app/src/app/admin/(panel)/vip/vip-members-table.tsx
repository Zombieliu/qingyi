"use client";
import { t } from "@/lib/i18n/t";
import type { AdminMember, MemberStatus } from "@/lib/admin/admin-types";
import { MEMBER_STATUS_OPTIONS } from "@/lib/admin/admin-types";
import { formatDateISO } from "@/lib/shared/date-utils";
import { StateBlock } from "@/app/components/state-block";

function toDateInput(ts?: number | null) {
  if (!ts) return "";
  return formatDateISO(ts);
}

type Props = {
  members: AdminMember[];
  saving: Record<string, boolean>;
  setMembers: React.Dispatch<React.SetStateAction<AdminMember[]>>;
  updateMember: (id: string, data: Record<string, unknown>) => void;
};

export function VipMembersTable({ members, saving, setMembers, updateMember }: Props) {
  return (
    <div className="admin-card">
      <div className="admin-card-header">
        <h3>{t("ui.vip.224")}</h3>
        <div className="admin-card-actions">
          <span className="admin-pill">共 {members.length} 条</span>
        </div>
      </div>
      {members.length === 0 ? (
        <StateBlock
          tone="empty"
          size="compact"
          title={t("admin.vip.030")}
          description={t("admin.vip.031")}
        />
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t("ui.vip.225")}</th>
                <th>{t("ui.vip.226")}</th>
                <th>{t("ui.vip.227")}</th>
                <th>{t("ui.vip.228")}</th>
                <th>{t("ui.vip.229")}</th>
                <th>{t("ui.vip.230")}</th>
                <th>{t("ui.vip.231")}</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id}>
                  <td data-label={t("admin.vip.032")}>
                    <div className="admin-text-strong">{member.userName || "-"}</div>
                    <div className="admin-meta">{member.userAddress || "-"}</div>
                  </td>
                  <td data-label={t("admin.vip.033")}>{member.tierName || "-"}</td>
                  <td data-label={t("admin.vip.034")}>
                    <input
                      className="admin-input"
                      value={member.points ?? ""}
                      onChange={(e) =>
                        setMembers((prev) =>
                          prev.map((item) =>
                            item.id === member.id
                              ? {
                                  ...item,
                                  points: e.target.value ? Number(e.target.value) : undefined,
                                }
                              : item
                          )
                        )
                      }
                      onBlur={(e) =>
                        updateMember(member.id, {
                          points: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                    />
                  </td>
                  <td data-label={t("admin.vip.035")}>
                    <input
                      className="admin-input"
                      type="date"
                      value={toDateInput(member.expiresAt)}
                      onChange={(e) =>
                        setMembers((prev) =>
                          prev.map((item) =>
                            item.id === member.id
                              ? {
                                  ...item,
                                  expiresAt: e.target.value
                                    ? new Date(e.target.value).getTime()
                                    : undefined,
                                }
                              : item
                          )
                        )
                      }
                      onBlur={(e) =>
                        updateMember(member.id, {
                          expiresAt: e.target.value ? new Date(e.target.value).getTime() : null,
                        })
                      }
                    />
                  </td>
                  <td data-label={t("admin.vip.036")}>
                    <select
                      className="admin-select"
                      value={member.status}
                      onChange={(e) => {
                        const next = e.target.value as MemberStatus;
                        setMembers((prev) =>
                          prev.map((item) =>
                            item.id === member.id ? { ...item, status: next } : item
                          )
                        );
                        updateMember(member.id, { status: next });
                      }}
                    >
                      {MEMBER_STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td data-label={t("admin.vip.037")}>
                    <input
                      className="admin-input"
                      placeholder={t("admin.vip.038")}
                      value={member.note || ""}
                      onChange={(e) =>
                        setMembers((prev) =>
                          prev.map((item) =>
                            item.id === member.id ? { ...item, note: e.target.value } : item
                          )
                        )
                      }
                      onBlur={(e) => updateMember(member.id, { note: e.target.value })}
                    />
                  </td>
                  <td data-label={t("admin.vip.039")}>
                    <span className="admin-badge neutral">
                      {saving[member.id] ? t("ui.vip.522") : t("admin.vip.040")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
