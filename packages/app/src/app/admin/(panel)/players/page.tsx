"use client";
import { t } from "@/lib/i18n/i18n-client";

import { useEffect, useMemo, useState } from "react";
import { PlusCircle, Trash2 } from "lucide-react";
import type { AdminPlayer, PlayerStatus } from "@/lib/admin/admin-types";
import { PLAYER_STATUS_OPTIONS } from "@/lib/admin/admin-types";
import { readCache, writeCache } from "@/lib/shared/client-cache";
import { StateBlock } from "@/app/components/state-block";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { roleRank, useAdminSession } from "../admin-session";

export default function PlayersPage() {
  const { role } = useAdminSession();
  const canEdit = roleRank(role) >= roleRank("viewer");
  const [players, setPlayers] = useState<AdminPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [formHint, setFormHint] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    role: "",
    contact: "",
    address: "",
    depositBase: "",
    depositLocked: "",
    creditMultiplier: "1",
    status: "可接单" as PlayerStatus,
    notes: "",
  });
  const cacheTtlMs = 60_000;

  const parseAddress = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return { state: "missing" as const, normalized: "" };
    try {
      const normalized = normalizeSuiAddress(trimmed);
      if (!isValidSuiAddress(normalized)) return { state: "invalid" as const, normalized: trimmed };
      return { state: "valid" as const, normalized };
    } catch {
      return { state: "invalid" as const, normalized: trimmed };
    }
  };

  const isMobileNumber = (value: string) => /^1\d{10}$/.test(value);

  const formatAddressError = (error?: string) => {
    switch (error) {
      case "address_required":
        return t("admin.players.001");
      case "contact_required":
        return t("admin.players.002");
      case "invalid_address":
        return t("admin.players.003");
      case "invalid_contact":
        return t("admin.players.004");
      case "address_in_use":
        return t("admin.players.005");
      default:
        return error || "保存失败";
    }
  };

  const addressStats = useMemo(() => {
    let missing = 0;
    let invalid = 0;
    players.forEach((player) => {
      const state = parseAddress(player.address || "").state;
      if (state === "missing") missing += 1;
      if (state === "invalid") invalid += 1;
    });
    return { missing, invalid };
  }, [players]);

  const loadPlayers = async () => {
    setLoading(true);
    try {
      const cacheKey = "cache:admin:players";
      const cached = readCache<AdminPlayer[]>(cacheKey, cacheTtlMs, true);
      if (cached) {
        setPlayers(Array.isArray(cached.value) ? cached.value : []);
      }
      const res = await fetch("/api/admin/players");
      if (res.ok) {
        const data = await res.json();
        const next = Array.isArray(data) ? data : [];
        setPlayers(next);
        setSelectedIds([]);
        writeCache(cacheKey, next);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlayers();
  }, []);

  const createPlayer = async () => {
    if (!canEdit) return;
    if (!form.name.trim()) {
      setFormHint("form.companion_name_required");
      return;
    }
    const contactValue = form.contact.trim();
    if (!contactValue) {
      setFormHint("form.phone_number_required");
      return;
    }
    if (contactValue && !isMobileNumber(contactValue)) {
      setFormHint("form.phone_invalid");
      return;
    }
    const addressParsed = parseAddress(form.address);
    if (addressParsed.state !== "valid") {
      setFormHint(addressParsed.state === "missing" ? "请填写钱包地址" : t("admin.players.006"));
      return;
    }
    const res = await fetch("/api/admin/players", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name.trim(),
        role: form.role.trim(),
        contact: contactValue,
        address: addressParsed.normalized,
        depositBase: form.depositBase ? Number(form.depositBase) : undefined,
        depositLocked: form.depositLocked ? Number(form.depositLocked) : undefined,
        creditMultiplier: form.creditMultiplier ? Number(form.creditMultiplier) : undefined,
        status: form.status,
        notes: form.notes.trim(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFormHint(formatAddressError(data?.error));
      return;
    }
    await loadPlayers();
    setFormHint(null);
    setForm({
      name: "",
      role: "",
      contact: "",
      address: "",
      depositBase: "",
      depositLocked: "",
      creditMultiplier: "1",
      status: "可接单",
      notes: "",
    });
  };

  const updatePlayer = async (playerId: string, patch: Partial<AdminPlayer>) => {
    if (!canEdit) return;
    const nextPatch = { ...patch };
    if (typeof nextPatch.contact === "string") {
      const trimmed = nextPatch.contact.trim();
      if (!trimmed) {
        alert("form.phone_required");
        return;
      }
      if (trimmed && !isMobileNumber(trimmed)) {
        alert("form.phone_invalid");
        return;
      }
      nextPatch.contact = trimmed;
    }
    setSaving((prev) => ({ ...prev, [playerId]: true }));
    try {
      const res = await fetch(`/api/admin/players/${playerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextPatch),
      });
      if (res.ok) {
        await res.json();
        await loadPlayers();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(formatAddressError(data?.error));
      }
    } finally {
      setSaving((prev) => ({ ...prev, [playerId]: false }));
    }
  };

  const removePlayer = async (playerId: string) => {
    if (!canEdit) return;
    if (!confirm(t("admin.players.007"))) return;
    setSaving((prev) => ({ ...prev, [playerId]: true }));
    try {
      const res = await fetch(`/api/admin/players/${playerId}`, { method: "DELETE" });
      if (res.ok) {
        setPlayers((prev) => {
          const next = prev.filter((p) => p.id !== playerId);
          writeCache("cache:admin:players", next);
          return next;
        });
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data?.error || "删除失败");
      }
    } finally {
      setSaving((prev) => ({ ...prev, [playerId]: false }));
    }
  };

  const toggleSelect = (id: string) => {
    if (!canEdit) return;
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = (checked: boolean) => {
    if (!canEdit) return;
    setSelectedIds(checked ? players.map((item) => item.id) : []);
  };

  const bulkDelete = async () => {
    if (!canEdit) return;
    if (selectedIds.length === 0) return;
    if (!confirm(`确定要删除选中的 ${selectedIds.length} 位陪练吗？`)) return;
    const res = await fetch("/api/admin/players/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selectedIds }),
    });
    if (res.ok) {
      setPlayers((prev) => {
        const next = prev.filter((item) => !selectedIds.includes(item.id));
        writeCache("cache:admin:players", next);
        return next;
      });
      setSelectedIds([]);
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data?.error || "批量删除失败");
    }
  };

  return (
    <div className="admin-section">
      <div className="admin-card">
        <div className="admin-card-header">
          <div>
            <h3>{t("ui.players.265")}</h3>
            <p>{t("ui.players.266")}</p>
          </div>
        </div>
        {canEdit ? (
          <>
            <div
              className="admin-form"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}
            >
              <label className="admin-field">
                名称
                <input
                  className="admin-input"
                  placeholder={t("admin.players.008")}
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                />
              </label>
              <label className="admin-field">
                擅长位置
                <input
                  className="admin-input"
                  placeholder={t("admin.players.009")}
                  value={form.role}
                  onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value }))}
                />
              </label>
              <label className="admin-field">
                手机号（必填）
                <input
                  className="admin-input"
                  placeholder={t("admin.players.010")}
                  value={form.contact}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, contact: event.target.value }))
                  }
                />
              </label>
              <label className="admin-field">
                钱包地址
                <input
                  className="admin-input"
                  placeholder={t("admin.players.011")}
                  value={form.address}
                  onChange={(event) => {
                    setFormHint(null);
                    setForm((prev) => ({ ...prev, address: event.target.value }));
                  }}
                />
              </label>
              <label className="admin-field">
                基础押金(钻石)
                <input
                  className="admin-input"
                  placeholder={t("admin.players.012")}
                  value={form.depositBase}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, depositBase: event.target.value }))
                  }
                />
              </label>
              <label className="admin-field">
                已锁押金(钻石)
                <input
                  className="admin-input"
                  placeholder={t("admin.players.013")}
                  value={form.depositLocked}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, depositLocked: event.target.value }))
                  }
                />
                <button
                  className="admin-btn ghost"
                  type="button"
                  style={{ padding: "6px 10px", fontSize: 12, justifySelf: "start" }}
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      depositLocked: prev.depositBase ? prev.depositBase : "",
                    }))
                  }
                >
                  同基础
                </button>
              </label>
              <label className="admin-field">
                授信倍数(1-5)
                <input
                  className="admin-input"
                  placeholder="1-5"
                  value={form.creditMultiplier}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, creditMultiplier: event.target.value }))
                  }
                />
              </label>
              <label className="admin-field">
                状态
                <select
                  className="admin-select"
                  value={form.status}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, status: event.target.value as PlayerStatus }))
                  }
                >
                  {PLAYER_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-field" style={{ gridColumn: "1 / -1" }}>
                备注
                <input
                  className="admin-input"
                  placeholder={t("admin.players.014")}
                  value={form.notes}
                  onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                />
              </label>
            </div>
            <button className="admin-btn primary" onClick={createPlayer} style={{ marginTop: 14 }}>
              <PlusCircle size={16} style={{ marginRight: 6 }} />
              添加陪练
            </button>
            {formHint && (
              <div style={{ marginTop: 12 }}>
                <StateBlock tone="warning" size="compact" title={formHint} />
              </div>
            )}
          </>
        ) : (
          <div style={{ marginTop: 12 }}>
            <StateBlock
              tone="warning"
              size="compact"
              title={t("admin.players.015")}
              description={t("admin.players.016")}
            />
          </div>
        )}
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h3>{t("ui.players.267")}</h3>
          <div className="admin-card-actions">
            {addressStats.invalid > 0 && (
              <span className="admin-badge warm">地址格式错误 {addressStats.invalid}</span>
            )}
            {addressStats.missing > 0 && (
              <span className="admin-badge warm">未绑定地址 {addressStats.missing}</span>
            )}
            {addressStats.invalid === 0 && addressStats.missing === 0 && (
              <span className="admin-badge">{t("ui.players.268")}</span>
            )}
            <label className="admin-check">
              <input
                type="checkbox"
                checked={players.length > 0 && selectedIds.length === players.length}
                onChange={(event) => toggleSelectAll(event.target.checked)}
                disabled={players.length === 0 || !canEdit}
              />
              全选
            </label>
            {canEdit ? (
              <button
                className="admin-btn ghost"
                disabled={selectedIds.length === 0}
                onClick={bulkDelete}
              >
                <Trash2 size={14} style={{ marginRight: 4 }} />
                批量删除{selectedIds.length > 0 ? `（${selectedIds.length}）` : ""}
              </button>
            ) : (
              <span className="admin-badge neutral">{t("ui.players.269")}</span>
            )}
          </div>
        </div>
        {loading ? (
          <StateBlock
            tone="loading"
            size="compact"
            title={t("admin.players.018")}
            description={t("admin.players.017")}
          />
        ) : players.length === 0 ? (
          <StateBlock
            tone="empty"
            size="compact"
            title={t("admin.players.019")}
            description={t("admin.players.020")}
          />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t("ui.players.270")}</th>
                  <th>{t("ui.players.271")}</th>
                  <th>{t("ui.players.272")}</th>
                  <th>{t("ui.players.273")}</th>
                  <th>{t("ui.players.274")}</th>
                  <th>{t("ui.players.275")}</th>
                  <th>{t("ui.players.276")}</th>
                  <th>{t("ui.players.277")}</th>
                  <th>{t("ui.players.278")}</th>
                  <th>{t("ui.players.279")}</th>
                  <th>{t("ui.players.280")}</th>
                  <th>{t("ui.players.281")}</th>
                  <th>{t("ui.players.282")}</th>
                  <th>{t("ui.players.283")}</th>
                </tr>
              </thead>
              <tbody>
                {players.map((player) => {
                  const addressState = parseAddress(player.address || "").state;
                  return (
                    <tr key={player.id}>
                      <td data-label={t("admin.players.021")}>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(player.id)}
                          onChange={() => toggleSelect(player.id)}
                          disabled={!canEdit}
                        />
                      </td>
                      <td data-label={t("admin.players.022")}>
                        <input
                          className="admin-input admin-text-strong"
                          value={player.name}
                          readOnly={!canEdit}
                          onChange={(event) =>
                            setPlayers((prev) =>
                              prev.map((p) =>
                                p.id === player.id ? { ...p, name: event.target.value } : p
                              )
                            )
                          }
                          onBlur={(event) => {
                            if (!canEdit) return;
                            const nextName = event.target.value.trim();
                            if (!nextName) {
                              alert("form.name_required");
                              loadPlayers();
                              return;
                            }
                            updatePlayer(player.id, { name: nextName });
                          }}
                        />
                      </td>
                      <td data-label={t("admin.players.023")}>
                        <input
                          className="admin-input"
                          value={player.role || ""}
                          readOnly={!canEdit}
                          onChange={(event) =>
                            setPlayers((prev) =>
                              prev.map((p) =>
                                p.id === player.id ? { ...p, role: event.target.value } : p
                              )
                            )
                          }
                          onBlur={(event) => {
                            if (!canEdit) return;
                            updatePlayer(player.id, { role: event.target.value });
                          }}
                        />
                      </td>
                      <td data-label={t("admin.players.024")}>
                        <input
                          className="admin-input"
                          value={player.contact || ""}
                          placeholder={t("admin.players.025")}
                          readOnly={!canEdit}
                          onChange={(event) =>
                            setPlayers((prev) =>
                              prev.map((p) =>
                                p.id === player.id ? { ...p, contact: event.target.value } : p
                              )
                            )
                          }
                          onBlur={(event) => {
                            if (!canEdit) return;
                            updatePlayer(player.id, { contact: event.target.value });
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
                          onChange={(event) =>
                            setPlayers((prev) =>
                              prev.map((p) =>
                                p.id === player.id ? { ...p, address: event.target.value } : p
                              )
                            )
                          }
                          onBlur={(event) => {
                            if (!canEdit) return;
                            const parsed = parseAddress(event.target.value);
                            if (parsed.state === "invalid") {
                              alert("diamond.invalid_address");
                              return;
                            }
                            const nextAddress = parsed.state === "missing" ? "" : parsed.normalized;
                            setPlayers((prev) =>
                              prev.map((p) =>
                                p.id === player.id ? { ...p, address: nextAddress } : p
                              )
                            );
                            updatePlayer(player.id, { address: nextAddress });
                          }}
                        />
                      </td>
                      <td data-label={t("admin.players.027")}>
                        <input
                          className="admin-input"
                          value={player.depositBase ?? ""}
                          readOnly={!canEdit}
                          onChange={(event) =>
                            setPlayers((prev) =>
                              prev.map((p) =>
                                p.id === player.id
                                  ? { ...p, depositBase: Number(event.target.value) || 0 }
                                  : p
                              )
                            )
                          }
                          onBlur={(event) => {
                            if (!canEdit) return;
                            updatePlayer(player.id, {
                              depositBase: Number(event.target.value) || 0,
                            });
                          }}
                        />
                      </td>
                      <td data-label={t("admin.players.028")}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <input
                            className="admin-input"
                            value={player.depositLocked ?? ""}
                            readOnly={!canEdit}
                            onChange={(event) =>
                              setPlayers((prev) =>
                                prev.map((p) =>
                                  p.id === player.id
                                    ? { ...p, depositLocked: Number(event.target.value) || 0 }
                                    : p
                                )
                              )
                            }
                            onBlur={(event) => {
                              if (!canEdit) return;
                              updatePlayer(player.id, {
                                depositLocked: Number(event.target.value) || 0,
                              });
                            }}
                          />
                          <button
                            className="admin-btn ghost"
                            type="button"
                            style={{ padding: "6px 10px", fontSize: 12 }}
                            disabled={player.depositBase === undefined || !canEdit}
                            onClick={() => {
                              if (!canEdit) return;
                              const nextLocked = player.depositBase ?? 0;
                              setPlayers((prev) =>
                                prev.map((p) =>
                                  p.id === player.id ? { ...p, depositLocked: nextLocked } : p
                                )
                              );
                              updatePlayer(player.id, { depositLocked: nextLocked });
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
                          onChange={(event) =>
                            setPlayers((prev) =>
                              prev.map((p) =>
                                p.id === player.id
                                  ? { ...p, creditMultiplier: Number(event.target.value) || 1 }
                                  : p
                              )
                            )
                          }
                          onBlur={(event) => {
                            if (!canEdit) return;
                            updatePlayer(player.id, {
                              creditMultiplier: Number(event.target.value) || 1,
                            });
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
                          onChange={(event) => {
                            if (!canEdit) return;
                            const nextStatus = event.target.value as PlayerStatus;
                            setPlayers((prev) =>
                              prev.map((p) =>
                                p.id === player.id ? { ...p, status: nextStatus } : p
                              )
                            );
                            updatePlayer(player.id, { status: nextStatus });
                          }}
                        >
                          {PLAYER_STATUS_OPTIONS.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td data-label={t("admin.players.034")}>
                        <input
                          className="admin-input"
                          value={player.notes || ""}
                          readOnly={!canEdit}
                          onChange={(event) =>
                            setPlayers((prev) =>
                              prev.map((p) =>
                                p.id === player.id ? { ...p, notes: event.target.value } : p
                              )
                            )
                          }
                          onBlur={(event) => {
                            if (!canEdit) return;
                            updatePlayer(player.id, { notes: event.target.value });
                          }}
                        />
                      </td>
                      <td data-label={t("admin.players.035")}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span className="admin-badge neutral">
                            {saving[player.id] ? t("ui.players.524") : t("admin.players.036")}
                          </span>
                          {canEdit ? (
                            <button
                              className="admin-btn ghost"
                              onClick={() => removePlayer(player.id)}
                              disabled={saving[player.id]}
                            >
                              <Trash2 size={14} style={{ marginRight: 4 }} />
                              删除
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
