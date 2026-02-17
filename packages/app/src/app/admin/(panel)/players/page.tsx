"use client";

import { useEffect, useMemo, useState } from "react";
import { PlusCircle, Trash2 } from "lucide-react";
import type { AdminPlayer, PlayerStatus } from "@/lib/admin-types";
import { PLAYER_STATUS_OPTIONS } from "@/lib/admin-types";
import { readCache, writeCache } from "@/app/components/client-cache";
import { StateBlock } from "@/app/components/state-block";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { roleRank, useAdminSession } from "../admin-session";

export default function PlayersPage() {
  const { role } = useAdminSession();
  const canEdit = roleRank(role) >= roleRank("ops");
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

  const formatAddressError = (error?: string) => {
    switch (error) {
      case "address_required":
        return "请填写钱包地址";
      case "invalid_address":
        return "钱包地址格式不正确";
      case "address_in_use":
        return "钱包地址已绑定其他打手";
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
      setFormHint("请填写打手名称");
      return;
    }
    const addressParsed = parseAddress(form.address);
    if (addressParsed.state !== "valid") {
      setFormHint(addressParsed.state === "missing" ? "请填写钱包地址" : "钱包地址格式不正确");
      return;
    }
    const res = await fetch("/api/admin/players", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          role: form.role.trim(),
          contact: form.contact.trim(),
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
    setSaving((prev) => ({ ...prev, [playerId]: true }));
    try {
      const res = await fetch(`/api/admin/players/${playerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
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
    if (!confirm("确定要删除该打手吗？")) return;
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
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]));
  };

  const toggleSelectAll = (checked: boolean) => {
    if (!canEdit) return;
    setSelectedIds(checked ? players.map((item) => item.id) : []);
  };

  const bulkDelete = async () => {
    if (!canEdit) return;
    if (selectedIds.length === 0) return;
    if (!confirm(`确定要删除选中的 ${selectedIds.length} 位打手吗？`)) return;
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
            <h3>新增打手档案</h3>
            <p>录入打手信息与授信配置。</p>
          </div>
        </div>
        {canEdit ? (
          <>
            <div className="admin-form" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
              <label className="admin-field">
                名称
                <input
                  className="admin-input"
                  placeholder="姓名 / 昵称"
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                />
              </label>
              <label className="admin-field">
                擅长位置
                <input
                  className="admin-input"
                  placeholder="突破 / 指挥 / 医疗"
                  value={form.role}
                  onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value }))}
                />
              </label>
              <label className="admin-field">
                联系方式
                <input
                  className="admin-input"
                  placeholder="微信 / QQ"
                  value={form.contact}
                  onChange={(event) => setForm((prev) => ({ ...prev, contact: event.target.value }))}
                />
              </label>
              <label className="admin-field">
                钱包地址
                <input
                  className="admin-input"
                  placeholder="Sui 地址（0x...）"
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
                  placeholder="如 1000"
                  value={form.depositBase}
                  onChange={(event) => setForm((prev) => ({ ...prev, depositBase: event.target.value }))}
                />
              </label>
              <label className="admin-field">
                已锁押金(钻石)
                <input
                  className="admin-input"
                  placeholder="如 1000"
                  value={form.depositLocked}
                  onChange={(event) => setForm((prev) => ({ ...prev, depositLocked: event.target.value }))}
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
                  onChange={(event) => setForm((prev) => ({ ...prev, creditMultiplier: event.target.value }))}
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
                  placeholder="常用时间、特点等"
                  value={form.notes}
                  onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                />
              </label>
            </div>
            <button className="admin-btn primary" onClick={createPlayer} style={{ marginTop: 14 }}>
              <PlusCircle size={16} style={{ marginRight: 6 }} />
              添加打手
            </button>
            {formHint && (
              <div style={{ marginTop: 12 }}>
                <StateBlock tone="warning" size="compact" title={formHint} />
              </div>
            )}
          </>
        ) : (
          <div style={{ marginTop: 12 }}>
            <StateBlock tone="warning" size="compact" title="只读权限" description="当前账号无法新增或编辑打手" />
          </div>
        )}
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h3>打手列表</h3>
          <div className="admin-card-actions">
            {addressStats.invalid > 0 && <span className="admin-badge warm">地址格式错误 {addressStats.invalid}</span>}
            {addressStats.missing > 0 && <span className="admin-badge warm">未绑定地址 {addressStats.missing}</span>}
            {addressStats.invalid === 0 && addressStats.missing === 0 && (
              <span className="admin-badge">地址已齐全</span>
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
              <button className="admin-btn ghost" disabled={selectedIds.length === 0} onClick={bulkDelete}>
                <Trash2 size={14} style={{ marginRight: 4 }} />
                批量删除{selectedIds.length > 0 ? `（${selectedIds.length}）` : ""}
              </button>
            ) : (
              <span className="admin-badge neutral">只读权限</span>
            )}
          </div>
        </div>
        {loading ? (
          <StateBlock tone="loading" size="compact" title="加载中" description="正在同步打手档案" />
        ) : players.length === 0 ? (
          <StateBlock tone="empty" size="compact" title="暂无打手档案" description="可以先创建打手资料" />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>选择</th>
                  <th>名称</th>
                  <th>位置</th>
                  <th>联系方式</th>
                  <th>钱包地址</th>
                  <th>基础押金(钻石)</th>
                  <th>已锁押金(钻石)</th>
                  <th>授信倍数</th>
                  <th>可接额度(元)</th>
                  <th>已占用(元)</th>
                  <th>可用额度(元)</th>
                  <th>状态</th>
                  <th>备注</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {players.map((player) => {
                  const addressState = parseAddress(player.address || "").state;
                  return (
                  <tr key={player.id}>
                    <td data-label="选择">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(player.id)}
                        onChange={() => toggleSelect(player.id)}
                        disabled={!canEdit}
                      />
                    </td>
                    <td data-label="名称">
                      <span className="admin-text-strong">{player.name}</span>
                    </td>
                    <td data-label="位置">
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
                    <td data-label="联系方式">
                      <input
                        className="admin-input"
                        value={player.contact || ""}
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
                    <td data-label="钱包地址">
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
                            alert("钱包地址格式不正确");
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
                    <td data-label="基础押金(钻石)">
                      <input
                        className="admin-input"
                        value={player.depositBase ?? ""}
                        readOnly={!canEdit}
                        onChange={(event) =>
                          setPlayers((prev) =>
                            prev.map((p) =>
                              p.id === player.id ? { ...p, depositBase: Number(event.target.value) || 0 } : p
                            )
                          )
                        }
                        onBlur={(event) => {
                          if (!canEdit) return;
                          updatePlayer(player.id, { depositBase: Number(event.target.value) || 0 });
                        }}
                      />
                    </td>
                    <td data-label="已锁押金(钻石)">
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
                            updatePlayer(player.id, { depositLocked: Number(event.target.value) || 0 });
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
                    <td data-label="授信倍数">
                      <input
                        className="admin-input"
                        value={player.creditMultiplier ?? 1}
                        readOnly={!canEdit}
                        onChange={(event) =>
                          setPlayers((prev) =>
                            prev.map((p) =>
                              p.id === player.id ? { ...p, creditMultiplier: Number(event.target.value) || 1 } : p
                            )
                          )
                        }
                        onBlur={(event) => {
                          if (!canEdit) return;
                          updatePlayer(player.id, { creditMultiplier: Number(event.target.value) || 1 });
                        }}
                      />
                    </td>
                    <td data-label="可接额度(元)">{player.creditLimit ?? 0}</td>
                    <td data-label="已占用(元)">{player.usedCredit ?? 0}</td>
                    <td data-label="可用额度(元)">{player.availableCredit ?? 0}</td>
                    <td data-label="状态">
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
                    <td data-label="备注">
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
                    <td data-label="操作">
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className="admin-badge neutral">
                          {saving[player.id] ? "保存中" : "已同步"}
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
