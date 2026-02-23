"use client";
import { t } from "@/lib/i18n/t";
import { Loader2 } from "lucide-react";
import { StateBlock } from "@/app/components/state-block";

type RedeemCode = {
  id: string;
  code: string;
  batchId?: string | null;
  status: string;
  usedCount: number;
  maxRedeem: number;
  rewardType?: string | null;
  rewardPayload?: Record<string, unknown> | null;
  startsAt?: number | null;
  expiresAt?: number | null;
  batch?: {
    id: string;
    title: string;
    rewardType: string;
    rewardPayload?: Record<string, unknown> | null;
  } | null;
};

type Props = {
  codes: RedeemCode[];
  loading: boolean;
  query: string;
  statusFilter: string;
  patchingId: string | null;
  statusLabels: Record<string, string>;
  rewardLabels: Record<string, string>;
  setQuery: (v: string) => void;
  setStatusFilter: (v: string) => void;
  loadCodes: () => void;
  patchStatus: (id: string, status: string) => void;
  formatCode: (code: string) => string;
  formatTime: (ts: number) => string;
};

export function RedeemCodesTable({
  codes,
  loading,
  query,
  statusFilter,
  patchingId,
  statusLabels,
  rewardLabels,
  setQuery,
  setStatusFilter,
  loadCodes,
  patchStatus,
  formatCode,
  formatTime,
}: Props) {
  return (
    <div className="admin-card">
      <div className="admin-card-header">
        <div>
          <h3>{t("ui.redeem.294")}</h3>
          <p>{t("ui.redeem.295")}</p>
        </div>
      </div>
      <div className="admin-card-actions" style={{ marginTop: 12 }}>
        <input
          className="admin-input"
          style={{ maxWidth: 240 }}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("admin.redeem.024")}
        />
        <select
          className="admin-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">{t("ui.redeem.296")}</option>
          <option value="active">{t("ui.redeem.297")}</option>
          <option value="disabled">{t("ui.redeem.298")}</option>
          <option value="exhausted">{t("ui.redeem.299")}</option>
          <option value="expired">{t("ui.redeem.300")}</option>
        </select>
        <button className="admin-btn ghost" onClick={loadCodes}>
          刷新
        </button>
      </div>
      {loading ? (
        <StateBlock tone="loading" size="compact" title={t("admin.redeem.025")} />
      ) : codes.length === 0 ? (
        <StateBlock tone="empty" size="compact" title={t("admin.redeem.026")} />
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t("ui.redeem.301")}</th>
                <th>{t("ui.redeem.302")}</th>
                <th>{t("ui.redeem.303")}</th>
                <th>{t("ui.redeem.304")}</th>
                <th>{t("ui.redeem.305")}</th>
                <th>{t("ui.redeem.306")}</th>
                <th>{t("ui.redeem.307")}</th>
              </tr>
            </thead>
            <tbody>
              {codes.map((code) => {
                const rewardType = code.rewardType || code.batch?.rewardType || "custom";
                const payload = (code.rewardPayload || code.batch?.rewardPayload || {}) as Record<
                  string,
                  unknown
                >;
                const summary = (() => {
                  if (rewardType === "mantou" || rewardType === "diamond") {
                    const amount = payload.amount;
                    return typeof amount === "number" || typeof amount === "string"
                      ? `${amount}`
                      : "-";
                  }
                  if (rewardType === "vip") {
                    const days = payload.days;
                    const value =
                      typeof days === "number" || typeof days === "string" ? `${days}` : "-";
                    return `${value} 天`;
                  }
                  if (rewardType === "coupon") {
                    const couponId = payload.couponId;
                    const couponCode = payload.couponCode;
                    if (typeof couponId === "string" && couponId) return couponId;
                    if (typeof couponCode === "string" && couponCode) return couponCode;
                    return "-";
                  }
                  const message = payload.message;
                  return typeof message === "string" && message ? message : "-";
                })();
                return (
                  <tr key={code.id}>
                    <td>{formatCode(code.code)}</td>
                    <td>
                      <div className="admin-text-strong">{code.batch?.title || "-"}</div>
                      <div className="admin-meta-faint">
                        {code.batch?.id || code.batchId || "-"}
                      </div>
                    </td>
                    <td>{statusLabels[code.status] || code.status}</td>
                    <td>
                      {code.usedCount}/{code.maxRedeem}
                    </td>
                    <td>
                      {rewardLabels[rewardType] || rewardType} · {summary}
                    </td>
                    <td>
                      {code.startsAt ? formatTime(code.startsAt) : t("admin.redeem.027")} ~{" "}
                      {code.expiresAt ? formatTime(code.expiresAt) : t("admin.redeem.028")}
                    </td>
                    <td>
                      {code.status === "active" ? (
                        <button
                          className="admin-btn ghost"
                          disabled={patchingId === code.id}
                          onClick={() => patchStatus(code.id, "disabled")}
                        >
                          {patchingId === code.id ? (
                            <>
                              <Loader2 size={14} className="spin" /> 处理中...
                            </>
                          ) : (
                            "停用"
                          )}
                        </button>
                      ) : code.status === "disabled" ? (
                        <button
                          className="admin-btn ghost"
                          disabled={patchingId === code.id}
                          onClick={() => patchStatus(code.id, "active")}
                        >
                          {patchingId === code.id ? (
                            <>
                              <Loader2 size={14} className="spin" /> 处理中...
                            </>
                          ) : (
                            "启用"
                          )}
                        </button>
                      ) : (
                        <span className="admin-meta">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
