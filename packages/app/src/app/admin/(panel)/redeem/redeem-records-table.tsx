"use client";
import { t } from "@/lib/i18n/t";
import { StateBlock } from "@/app/components/state-block";

type RedeemRecord = {
  id: string;
  createdAt: number;
  userAddress: string;
  code?: string;
  codeId: string;
  batchTitle?: string;
  batchId?: string | null;
  rewardType: string;
  status: string;
};

type Props = {
  records: RedeemRecord[];
  recordsLoading: boolean;
  statusLabels: Record<string, string>;
  rewardLabels: Record<string, string>;
  formatCode: (code: string) => string;
  formatTime: (ts: number) => string;
};

export function RedeemRecordsTable({
  records,
  recordsLoading,
  statusLabels,
  rewardLabels,
  formatCode,
  formatTime,
}: Props) {
  return (
    <div className="admin-card">
      <div className="admin-card-header">
        <div>
          <h3>{t("ui.redeem.308")}</h3>
          <p>{t("ui.redeem.309")}</p>
        </div>
      </div>
      {recordsLoading ? (
        <StateBlock tone="loading" size="compact" title={t("admin.redeem.029")} />
      ) : records.length === 0 ? (
        <StateBlock tone="empty" size="compact" title={t("admin.redeem.030")} />
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t("ui.redeem.310")}</th>
                <th>{t("ui.redeem.311")}</th>
                <th>{t("ui.redeem.312")}</th>
                <th>{t("ui.redeem.313")}</th>
                <th>{t("ui.redeem.314")}</th>
                <th>{t("ui.redeem.315")}</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id}>
                  <td>{formatTime(record.createdAt)}</td>
                  <td>{record.userAddress}</td>
                  <td>{record.code ? formatCode(record.code) : record.codeId}</td>
                  <td>{record.batchTitle || record.batchId || "-"}</td>
                  <td>{rewardLabels[record.rewardType] || record.rewardType}</td>
                  <td>{statusLabels[record.status] || record.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
