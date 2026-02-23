"use client";
import { t } from "@/lib/i18n/t";
import type { AdminMembershipRequest, MembershipRequestStatus } from "@/lib/admin/admin-types";
import { MEMBERSHIP_REQUEST_STATUS_OPTIONS } from "@/lib/admin/admin-types";
import { formatShortDateTime } from "@/lib/shared/date-utils";
import { StateBlock } from "@/app/components/state-block";

type Props = {
  requests: AdminMembershipRequest[];
  loading: boolean;
  saving: Record<string, boolean>;
  cacheHint: string | null;
  setRequests: React.Dispatch<React.SetStateAction<AdminMembershipRequest[]>>;
  updateRequest: (id: string, data: Record<string, unknown>) => void;
};

export function VipRequestsTable({
  requests,
  loading,
  saving,
  cacheHint,
  setRequests,
  updateRequest,
}: Props) {
  return (
    <div className="admin-card">
      <div className="admin-card-header">
        <h3>{t("ui.vip.216")}</h3>
        <div className="admin-card-actions">
          <span className="admin-pill">本页 {requests.length} 条</span>
          {cacheHint ? <span className="admin-pill">{cacheHint}</span> : null}
        </div>
      </div>
      {loading ? (
        <StateBlock
          tone="loading"
          size="compact"
          title={t("admin.vip.018")}
          description={t("admin.vip.017")}
        />
      ) : requests.length === 0 ? (
        <StateBlock
          tone="empty"
          size="compact"
          title={t("admin.vip.019")}
          description={t("admin.vip.020")}
        />
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t("ui.vip.217")}</th>
                <th>{t("ui.vip.218")}</th>
                <th>{t("ui.vip.219")}</th>
                <th>{t("ui.vip.220")}</th>
                <th>{t("ui.vip.221")}</th>
                <th>{t("ui.vip.222")}</th>
                <th>{t("ui.vip.223")}</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => (
                <tr key={req.id}>
                  <td data-label={t("admin.vip.021")}>
                    <div className="admin-text-strong">{req.userName || t("ui.vip.671")}</div>
                    <div className="admin-meta">{req.userAddress || "-"}</div>
                    <div className="admin-meta-faint">{req.id}</div>
                  </td>
                  <td data-label={t("admin.vip.022")}>{req.tierName || "-"}</td>
                  <td data-label={t("admin.vip.023")} className="admin-meta">
                    {req.contact || "-"}
                  </td>
                  <td data-label={t("admin.vip.024")}>
                    <select
                      className="admin-select"
                      value={req.status}
                      onChange={(e) => {
                        const next = e.target.value as MembershipRequestStatus;
                        setRequests((prev) =>
                          prev.map((item) =>
                            item.id === req.id ? { ...item, status: next } : item
                          )
                        );
                        updateRequest(req.id, { status: next });
                      }}
                    >
                      {MEMBERSHIP_REQUEST_STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td data-label={t("admin.vip.025")}>
                    <input
                      className="admin-input"
                      placeholder={t("admin.vip.026")}
                      value={req.note || ""}
                      onChange={(e) =>
                        setRequests((prev) =>
                          prev.map((item) =>
                            item.id === req.id ? { ...item, note: e.target.value } : item
                          )
                        )
                      }
                      onBlur={(e) => updateRequest(req.id, { note: e.target.value })}
                    />
                  </td>
                  <td data-label={t("admin.vip.027")}>{formatShortDateTime(req.createdAt)}</td>
                  <td data-label={t("admin.vip.028")}>
                    <span className="admin-badge neutral">
                      {saving[req.id] ? t("ui.vip.521") : t("admin.vip.029")}
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
