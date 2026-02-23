"use client";
import { t } from "@/lib/i18n/t";
import * as chainOrderUtils from "@/lib/chain/chain-order-utils";
import { StateBlock } from "@/app/components/state-block";

type ChainOrder = {
  orderId: string;
  user: string;
  companion: string;
  serviceFee: string;
  deposit: string;
  status: number;
  createdAt: string;
  disputeDeadline: string;
  localStatus?: number | null;
  effectiveStatus?: number | null;
};

const statusLabel = (status: number) => {
  switch (status) {
    case 0:
      return t("admin.chain.002");
    case 1:
      return t("admin.chain.003");
    case 2:
      return t("admin.chain.004");
    case 3:
      return t("admin.chain.005");
    case 4:
      return t("admin.chain.006");
    case 5:
      return t("admin.chain.007");
    case 6:
      return t("admin.chain.008");
    default:
      return `未知(${status})`;
  }
};

const statusBadgeClass = (status: number) => {
  if (status === 4) return "admin-badge warm";
  if (status === 6) return "admin-badge neutral";
  return "admin-badge";
};

const formatAmount = (value: string) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return value;
  return (num / 100).toFixed(2);
};

type Props = {
  chainOrders: ChainOrder[];
  loading: boolean;
  autoCancelMs: number | null;
  cancelingOrderId: string | null;
  now: number;
  resolveStatus: (order: ChainOrder) => number;
  onForceCancel: (orderId: string) => void;
};

export function ChainOrdersTable({
  chainOrders,
  loading,
  autoCancelMs,
  cancelingOrderId,
  now,
  resolveStatus,
  onForceCancel,
}: Props) {
  return (
    <div className="admin-card">
      <div className="admin-card-header">
        <h3>{t("ui.chain.321")}</h3>
        <div className="admin-card-actions">
          <span className="admin-pill">共 {chainOrders.length} 条</span>
        </div>
      </div>
      {loading ? (
        <StateBlock
          tone="loading"
          size="compact"
          title={t("admin.chain.021")}
          description={t("admin.chain.020")}
        />
      ) : chainOrders.length === 0 ? (
        <StateBlock
          tone="empty"
          size="compact"
          title={t("admin.chain.023")}
          description={t("admin.chain.022")}
        />
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t("ui.chain.322")}</th>
                <th>{t("ui.chain.323")}</th>
                <th>{t("ui.chain.324")}</th>
                <th>{t("ui.chain.325")}</th>
                <th>{t("ui.chain.326")}</th>
                <th>{t("ui.chain.327")}</th>
                <th>{t("ui.chain.328")}</th>
              </tr>
            </thead>
            <tbody>
              {chainOrders.map((order) => {
                const createdAt = Number(order.createdAt);
                const effectiveStatus = resolveStatus(order);
                const canCancel = chainOrderUtils.isChainOrderCancelable(effectiveStatus);
                const isExpired =
                  autoCancelMs !== null &&
                  chainOrderUtils.isChainOrderAutoCancelable(
                    { ...order, status: effectiveStatus },
                    now,
                    autoCancelMs
                  );
                return (
                  <tr key={order.orderId}>
                    <td data-label={t("admin.chain.024")}>{order.orderId}</td>
                    <td data-label={t("admin.chain.025")}>
                      <span className={statusBadgeClass(effectiveStatus)}>
                        {statusLabel(effectiveStatus)}
                      </span>
                      {typeof order.localStatus === "number" && order.localStatus > order.status ? (
                        <span className="admin-badge warm" style={{ marginLeft: 8 }}>
                          本地较新
                        </span>
                      ) : null}
                      {isExpired ? (
                        <span className="admin-badge warm" style={{ marginLeft: 8 }}>
                          超期
                        </span>
                      ) : null}
                    </td>
                    <td data-label={t("admin.chain.026")}>¥{formatAmount(order.serviceFee)}</td>
                    <td data-label={t("admin.chain.027")}>¥{formatAmount(order.deposit)}</td>
                    <td data-label={t("admin.chain.028")}>
                      {Number.isFinite(createdAt) && createdAt > 0
                        ? new Date(createdAt).toLocaleString()
                        : "-"}
                    </td>
                    <td data-label={t("admin.chain.029")}>
                      {Number(order.disputeDeadline) > 0
                        ? new Date(Number(order.disputeDeadline)).toLocaleString()
                        : "-"}
                    </td>
                    <td data-label={t("admin.chain.030")}>
                      {canCancel ? (
                        <button
                          className="admin-btn ghost"
                          onClick={() => onForceCancel(order.orderId)}
                          disabled={cancelingOrderId === order.orderId}
                        >
                          {cancelingOrderId === order.orderId
                            ? t("admin.panel.chain.i032")
                            : t("admin.chain.031")}
                        </button>
                      ) : (
                        <span className="admin-text-muted">{t("ui.chain.329")}</span>
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

type DisputedProps = {
  disputedOrders: ChainOrder[];
  loading: boolean;
  action: string | null;
  bps: Record<string, { service: string; deposit: string }>;
  onBpsChange: (orderId: string, field: "service" | "deposit", value: string) => void;
  onResolve: (orderId: string) => void;
};

export function DisputedOrdersCard({
  disputedOrders,
  loading,
  action,
  bps,
  onBpsChange,
  onResolve,
}: DisputedProps) {
  return (
    <div className="admin-card">
      <div className="admin-card-header">
        <h3>{t("ui.chain.320")}</h3>
        <div className="admin-card-actions">
          <span className="admin-pill">共 {disputedOrders.length} 条</span>
        </div>
      </div>
      {loading ? (
        <StateBlock
          tone="loading"
          size="compact"
          title={t("admin.chain.014")}
          description={t("admin.chain.013")}
        />
      ) : disputedOrders.length === 0 ? (
        <StateBlock
          tone="empty"
          size="compact"
          title={t("admin.chain.015")}
          description={t("admin.chain.016")}
        />
      ) : (
        <div className="admin-stack">
          {disputedOrders.map((order) => (
            <div key={order.orderId} className="admin-card admin-card--subtle">
              <div
                className="admin-card-header"
                style={{ alignItems: "flex-start", flexWrap: "wrap" }}
              >
                <div>
                  <div className="admin-text-strong">订单 #{order.orderId}</div>
                  <div className="admin-meta">
                    用户 {order.user.slice(0, 6)}...{order.user.slice(-4)} · 陪玩{" "}
                    {order.companion.slice(0, 6)}...{order.companion.slice(-4)}
                  </div>
                  <div className="admin-meta" style={{ marginTop: 6 }}>
                    撮合费 ¥{formatAmount(order.serviceFee)} · 押金 ¥{formatAmount(order.deposit)}
                  </div>
                </div>
                <div
                  className="admin-card-actions"
                  style={{ flexDirection: "column", alignItems: "stretch" }}
                >
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      className="admin-input"
                      style={{ width: 90 }}
                      placeholder={t("admin.chain.017")}
                      value={bps[order.orderId]?.service || ""}
                      onChange={(e) => onBpsChange(order.orderId, "service", e.target.value)}
                    />
                    <input
                      className="admin-input"
                      style={{ width: 90 }}
                      placeholder={t("admin.chain.018")}
                      value={bps[order.orderId]?.deposit || ""}
                      onChange={(e) => onBpsChange(order.orderId, "deposit", e.target.value)}
                    />
                  </div>
                  <button
                    className="admin-btn primary"
                    style={{ marginTop: 8 }}
                    disabled={action === order.orderId}
                    onClick={() => onResolve(order.orderId)}
                  >
                    {action === order.orderId ? t("ui.chain.651") : t("admin.chain.019")}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
