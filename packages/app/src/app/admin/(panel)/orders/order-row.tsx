"use client";
import { t } from "@/lib/i18n/t";
import Link from "next/link";
import type { AdminOrder, OrderStage, AdminPlayer } from "@/lib/admin/admin-types";
import { ORDER_STAGE_OPTIONS } from "@/lib/admin/admin-types";
import { formatShortDateTime } from "@/lib/shared/date-utils";

type Props = {
  order: AdminOrder;
  canEdit: boolean;
  saving: boolean;
  selected: boolean;
  players: AdminPlayer[];
  playersLoading: boolean;
  onToggleSelect: () => void;
  onUpdate: (id: string, data: Record<string, unknown>) => void;
  onSetField: (id: string, field: string, value: unknown) => void;
};

export function OrderRow({
  order,
  canEdit,
  saving,
  selected,
  players,
  playersLoading,
  onToggleSelect,
  onUpdate,
  onSetField,
}: Props) {
  const assignedKey = (order.assignedTo || "").trim();
  const matchedPlayer = assignedKey
    ? players.find((p) => p.id === assignedKey || p.name === assignedKey)
    : undefined;
  const selectValue = matchedPlayer ? matchedPlayer.id : assignedKey;
  const available = matchedPlayer?.availableCredit ?? 0;
  const used = matchedPlayer?.usedCredit ?? 0;
  const limit = matchedPlayer?.creditLimit ?? 0;
  const insufficient = matchedPlayer ? order.amount > available : false;
  const isChainOrder =
    Boolean(order.chainDigest) || (order.chainStatus !== undefined && order.chainStatus !== null);

  return (
    <tr>
      <td data-label={t("admin.orders.011")}>
        <input type="checkbox" checked={selected} onChange={onToggleSelect} disabled={!canEdit} />
      </td>
      <td data-label={t("admin.orders.012")}>
        <div className="admin-text-strong">{order.user}</div>
        <div className="admin-meta">{order.item}</div>
        <div className="admin-meta-faint">{order.id}</div>
        {isChainOrder ? (
          <div style={{ marginTop: 6 }}>
            <span className="admin-badge warm">{t("ui.orders.419")}</span>
          </div>
        ) : null}
        <div className="admin-meta-faint">{formatShortDateTime(order.createdAt)}</div>
      </td>
      <td data-label={t("admin.orders.013")}>
        <div className="admin-text-strong">
          {order.currency === "CNY" ? "¥" : order.currency} {order.amount}
        </div>
      </td>
      <td data-label={t("admin.orders.014")}>
        {isChainOrder || !canEdit ? (
          <input
            className="admin-input"
            readOnly
            value={order.paymentStatus || ""}
            title={isChainOrder ? t("ui.orders.665") : t("admin.orders.015")}
          />
        ) : (
          <input
            className="admin-input"
            value={order.paymentStatus || ""}
            onChange={(e) => onSetField(order.id, "paymentStatus", e.target.value)}
            onBlur={(e) => onUpdate(order.id, { paymentStatus: e.target.value })}
          />
        )}
      </td>
      <td data-label={t("admin.orders.016")}>
        <select
          className="admin-select"
          value={order.stage}
          aria-label={t("admin.orders.017")}
          disabled={isChainOrder || !canEdit}
          title={isChainOrder ? t("ui.orders.669") : !canEdit ? t("admin.panel.orders.i073") : ""}
          onChange={(e) => {
            if (isChainOrder || !canEdit) return;
            const next = e.target.value as OrderStage;
            onSetField(order.id, "stage", next);
            onUpdate(order.id, { stage: next });
          }}
        >
          {ORDER_STAGE_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </td>
      <td data-label={t("admin.orders.018")}>
        <div style={{ display: "grid", gap: 6 }}>
          <select
            className="admin-select"
            value={selectValue}
            aria-label={t("admin.orders.019")}
            disabled={!canEdit}
            onChange={(e) => {
              if (!canEdit) return;
              const v = e.target.value;
              const sp = players.find((p) => p.id === v);
              const assignedTo = sp ? sp.name : v;
              onSetField(order.id, "assignedTo", assignedTo);
              onUpdate(order.id, { assignedTo });
            }}
          >
            <option value="">{t("ui.orders.420")}</option>
            {assignedKey && !matchedPlayer ? (
              <option value={assignedKey}>当前：{assignedKey}</option>
            ) : null}
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.status !== t("admin.panel.orders.i074") ? `（${p.status}）` : ""}
              </option>
            ))}
          </select>
          <div className={`admin-meta-faint${insufficient ? " admin-text-danger" : ""}`}>
            {playersLoading
              ? t("admin.orders.020")
              : matchedPlayer
                ? `可用 ${available} 元 / 占用 ${used} 元 / 总额度 ${limit} 元`
                : t("ui.orders.627")}
            {insufficient ? t("ui.orders.709") : ""}
          </div>
        </div>
      </td>
      <td data-label={t("admin.orders.021")}>
        <input
          className="admin-input"
          placeholder={t("admin.orders.022")}
          value={order.note || ""}
          readOnly={!canEdit}
          onChange={(e) => {
            if (canEdit) onSetField(order.id, "note", e.target.value);
          }}
          onBlur={(e) => {
            if (canEdit) onUpdate(order.id, { note: e.target.value });
          }}
        />
      </td>
      <td data-label={t("admin.orders.023")}>
        <span className="admin-badge neutral">
          {saving ? t("ui.orders.529") : t("admin.orders.024")}
        </span>
      </td>
      <td data-label={t("admin.orders.025")}>
        <Link className="admin-btn ghost" href={`/admin/orders/${order.id}`}>
          查看
        </Link>
      </td>
    </tr>
  );
}
