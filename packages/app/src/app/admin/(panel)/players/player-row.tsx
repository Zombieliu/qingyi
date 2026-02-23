"use client";
import { t } from "@/lib/i18n/t";
import { Trash2 } from "lucide-react";
import type { AdminPlayer, PlayerStatus } from "@/lib/admin/admin-types";
import { PLAYER_STATUS_OPTIONS } from "@/lib/admin/admin-types";

type Props = {
  player: AdminPlayer;
  canEdit: boolean;
  saving: boolean;
  selected: boolean;
  addressState: "valid" | "invalid" | "missing";
  onToggleSelect: () => void;
  onUpdate: (id: string, data: Record<string, unknown>) => void;
  onRemove: (id: string) => void;
  onSetField: (id: string, field: string, value: unknown) => void;
  parseAddress: (addr: string) => { state: "valid" | "invalid" | "missing"; normalized: string };
  loadPlayers: () => void;
};

export function PlayerRow({
  player,
  canEdit,
  saving,
  selected,
  addressState,
  onToggleSelect,
  onUpdate,
  onRemove,
  onSetField,
  parseAddress,
  loadPlayers,
}: Props) {
  return (
    <tr>
      <td data-label={t("admin.players.021")}>
        <input type="checkbox" checked={selected} onChange={onToggleSelect} disabled={!canEdit} />
      </td>
      <td data-label={t("admin.players.022")}>
        <input
          className="admin-input admin-text-strong"
          value={player.name}
          readOnly={!canEdit}
          onChange={(e) => onSetField(player.id, "name", e.target.value)}
          onBlur={(e) => {
            if (!canEdit) return;
            const v = e.target.value.trim();
            if (!v) {
              alert("form.name_required");
              loadPlayers();
              return;
            }
            onUpdate(player.id, { name: v });
          }}
        />
      </td>
      <td data-label={t("admin.players.023")}>
        <input
          className="admin-input"
          value={player.role || ""}
          readOnly={!canEdit}
          onChange={(e) => onSetField(player.id, "role", e.target.value)}
          onBlur={(e) => {
            if (canEdit) onUpdate(player.id, { role: e.target.value });
          }}
        />
      </td>
      <td data-label={t("admin.players.024")}>
        <input
          className="admin-input"
          value={player.contact || ""}
          placeholder={t("admin.players.025")}
          readOnly={!canEdit}
          onChange={(e) => onSetField(player.id, "contact", e.target.value)}
          onBlur={(e) => {
            if (canEdit) onUpdate(player.id, { contact: e.target.value });
          }}
        />
      </td>
      <td data-label={t("admin.players.026")}>
        {addressState === "invalid" && (
          <span className="admin-badge warm" style={{ marginBottom: 6 }}>
            格式错误
          </span>
        )}
        {addressState === "missing" && (
          <span className="admin-badge warm" style={{ marginBottom: 6 }}>
            未绑定
          </span>
        )}
        <input
          className="admin-input"
          value={player.address || ""}
          readOnly={!canEdit}
          onChange={(e) => onSetField(player.id, "address", e.target.value)}
          onBlur={(e) => {
            if (!canEdit) return;
            const parsed = parseAddress(e.target.value);
            if (parsed.state === "invalid") {
              alert("diamond.invalid_address");
              return;
            }
            const next = parsed.state === "missing" ? "" : parsed.normalized;
            onSetField(player.id, "address", next);
            onUpdate(player.id, { address: next });
          }}
        />
      </td>
      <td data-label={t("admin.players.027")}>
        <input
          className="admin-input"
          value={player.depositBase ?? ""}
          readOnly={!canEdit}
          onChange={(e) => onSetField(player.id, "depositBase", Number(e.target.value) || 0)}
          onBlur={(e) => {
            if (canEdit) onUpdate(player.id, { depositBase: Number(e.target.value) || 0 });
          }}
        />
      </td>
      <td data-label={t("admin.players.028")}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            className="admin-input"
            value={player.depositLocked ?? ""}
            readOnly={!canEdit}
            onChange={(e) => onSetField(player.id, "depositLocked", Number(e.target.value) || 0)}
            onBlur={(e) => {
              if (canEdit) onUpdate(player.id, { depositLocked: Number(e.target.value) || 0 });
            }}
          />
          <button
            className="admin-btn ghost"
            type="button"
            style={{ padding: "6px 10px", fontSize: 12 }}
            disabled={player.depositBase === undefined || !canEdit}
            onClick={() => {
              if (!canEdit) return;
              const v = player.depositBase ?? 0;
              onSetField(player.id, "depositLocked", v);
              onUpdate(player.id, { depositLocked: v });
            }}
          >
            同基础
          </button>
        </div>
      </td>
      <td data-label={t("admin.players.029")}>
        <input
          className="admin-input"
          value={player.creditMultiplier ?? 1}
          readOnly={!canEdit}
          onChange={(e) => onSetField(player.id, "creditMultiplier", Number(e.target.value) || 1)}
          onBlur={(e) => {
            if (canEdit) onUpdate(player.id, { creditMultiplier: Number(e.target.value) || 1 });
          }}
        />
      </td>
      <td data-label={t("admin.players.030")}>{player.creditLimit ?? 0}</td>
      <td data-label={t("admin.players.031")}>{player.usedCredit ?? 0}</td>
      <td data-label={t("admin.players.032")}>{player.availableCredit ?? 0}</td>
      <td data-label={t("admin.players.033")}>
        <select
          className="admin-select"
          value={player.status}
          disabled={!canEdit}
          onChange={(e) => {
            if (!canEdit) return;
            const next = e.target.value as PlayerStatus;
            onSetField(player.id, "status", next);
            onUpdate(player.id, { status: next });
          }}
        >
          {PLAYER_STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </td>
      <td data-label={t("admin.players.034")}>
        <input
          className="admin-input"
          value={player.notes || ""}
          readOnly={!canEdit}
          onChange={(e) => onSetField(player.id, "notes", e.target.value)}
          onBlur={(e) => {
            if (canEdit) onUpdate(player.id, { notes: e.target.value });
          }}
        />
      </td>
      <td data-label={t("admin.players.035")}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="admin-badge neutral">
            {saving ? t("ui.players.524") : t("admin.players.036")}
          </span>
          {canEdit ? (
            <button
              className="admin-btn ghost"
              onClick={() => onRemove(player.id)}
              disabled={saving}
            >
              <Trash2 size={14} style={{ marginRight: 4 }} />
              删除
            </button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}
