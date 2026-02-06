"use client";

import { useEffect, useState } from "react";
import { PlusCircle, Trash2 } from "lucide-react";
import type { AdminPlayer, PlayerStatus } from "@/lib/admin-types";
import { PLAYER_STATUS_OPTIONS } from "@/lib/admin-types";
import { readCache, writeCache } from "@/app/components/client-cache";

export default function PlayersPage() {
  const [players, setPlayers] = useState<AdminPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
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
    if (!form.name.trim()) return;
    const res = await fetch("/api/admin/players", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          role: form.role.trim(),
          contact: form.contact.trim(),
          address: form.address.trim(),
          depositBase: form.depositBase ? Number(form.depositBase) : undefined,
          depositLocked: form.depositLocked ? Number(form.depositLocked) : undefined,
          creditMultiplier: form.creditMultiplier ? Number(form.creditMultiplier) : undefined,
          status: form.status,
          notes: form.notes.trim(),
        }),
      });
    if (res.ok) {
      await res.json();
      await loadPlayers();
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
    }
  };

  const updatePlayer = async (playerId: string, patch: Partial<AdminPlayer>) => {
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
      }
    } finally {
      setSaving((prev) => ({ ...prev, [playerId]: false }));
    }
  };

  const removePlayer = async (playerId: string) => {
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

  return (
    <div className="admin-section">
      <div className="admin-card">
        <h3>新增打手档案</h3>
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
            账号ID
            <input
              className="admin-input"
              placeholder="账号ID"
              value={form.address}
              onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
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
      </div>

      <div className="admin-card">
        <h3>打手列表</h3>
        {loading ? (
          <p>加载中...</p>
        ) : players.length === 0 ? (
          <p>暂无打手档案</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>位置</th>
                  <th>联系方式</th>
                  <th>账号ID</th>
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
                {players.map((player) => (
                  <tr key={player.id}>
                    <td data-label="名称" style={{ fontWeight: 600 }}>
                      {player.name}
                    </td>
                    <td data-label="位置">
                      <input
                        className="admin-input"
                        value={player.role || ""}
                        onChange={(event) =>
                          setPlayers((prev) =>
                            prev.map((p) =>
                              p.id === player.id ? { ...p, role: event.target.value } : p
                            )
                          )
                        }
                        onBlur={(event) => updatePlayer(player.id, { role: event.target.value })}
                      />
                    </td>
                    <td data-label="联系方式">
                      <input
                        className="admin-input"
                        value={player.contact || ""}
                        onChange={(event) =>
                          setPlayers((prev) =>
                            prev.map((p) =>
                              p.id === player.id ? { ...p, contact: event.target.value } : p
                            )
                          )
                        }
                        onBlur={(event) => updatePlayer(player.id, { contact: event.target.value })}
                      />
                    </td>
                    <td data-label="账号ID">
                      <input
                        className="admin-input"
                        value={player.address || ""}
                        onChange={(event) =>
                          setPlayers((prev) =>
                            prev.map((p) =>
                              p.id === player.id ? { ...p, address: event.target.value } : p
                            )
                          )
                        }
                        onBlur={(event) => updatePlayer(player.id, { address: event.target.value })}
                      />
                    </td>
                    <td data-label="基础押金(钻石)">
                      <input
                        className="admin-input"
                        value={player.depositBase ?? ""}
                        onChange={(event) =>
                          setPlayers((prev) =>
                            prev.map((p) =>
                              p.id === player.id ? { ...p, depositBase: Number(event.target.value) || 0 } : p
                            )
                          )
                        }
                        onBlur={(event) =>
                          updatePlayer(player.id, { depositBase: Number(event.target.value) || 0 })
                        }
                      />
                    </td>
                    <td data-label="已锁押金(钻石)">
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input
                          className="admin-input"
                          value={player.depositLocked ?? ""}
                          onChange={(event) =>
                            setPlayers((prev) =>
                              prev.map((p) =>
                                p.id === player.id
                                  ? { ...p, depositLocked: Number(event.target.value) || 0 }
                                  : p
                              )
                            )
                          }
                          onBlur={(event) =>
                            updatePlayer(player.id, { depositLocked: Number(event.target.value) || 0 })
                          }
                        />
                        <button
                          className="admin-btn ghost"
                          type="button"
                          style={{ padding: "6px 10px", fontSize: 12 }}
                          disabled={player.depositBase === undefined}
                          onClick={() => {
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
                        onChange={(event) =>
                          setPlayers((prev) =>
                            prev.map((p) =>
                              p.id === player.id ? { ...p, creditMultiplier: Number(event.target.value) || 1 } : p
                            )
                          )
                        }
                        onBlur={(event) =>
                          updatePlayer(player.id, { creditMultiplier: Number(event.target.value) || 1 })
                        }
                      />
                    </td>
                    <td data-label="可接额度(元)">{player.creditLimit ?? 0}</td>
                    <td data-label="已占用(元)">{player.usedCredit ?? 0}</td>
                    <td data-label="可用额度(元)">{player.availableCredit ?? 0}</td>
                    <td data-label="状态">
                      <select
                        className="admin-select"
                        value={player.status}
                        onChange={(event) => {
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
                        onChange={(event) =>
                          setPlayers((prev) =>
                            prev.map((p) =>
                              p.id === player.id ? { ...p, notes: event.target.value } : p
                            )
                          )
                        }
                        onBlur={(event) => updatePlayer(player.id, { notes: event.target.value })}
                      />
                    </td>
                    <td data-label="操作">
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className="admin-badge neutral">
                          {saving[player.id] ? "保存中" : "已同步"}
                        </span>
                        <button
                          className="admin-btn ghost"
                          onClick={() => removePlayer(player.id)}
                          disabled={saving[player.id]}
                        >
                          <Trash2 size={14} style={{ marginRight: 4 }} />
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
