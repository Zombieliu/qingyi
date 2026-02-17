"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, RefreshCw, Trash2 } from "lucide-react";
import type { AdminAccessToken, AdminRole, AdminTokenStatus } from "@/lib/admin-types";
import { ADMIN_ROLE_OPTIONS } from "@/lib/admin-types";
import { StateBlock } from "@/app/components/state-block";

type TokenView = Omit<AdminAccessToken, "tokenHash">;

type CreatedToken = {
  token: string;
  id: string;
};

const roleLabels: Record<AdminRole, string> = {
  admin: "超级管理员",
  finance: "财务",
  ops: "运营",
  viewer: "只读",
};

const statusLabels: Record<AdminTokenStatus, string> = {
  active: "启用",
  disabled: "禁用",
};

function formatTime(ts?: number) {
  if (!ts) return "-";
  return new Date(ts).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminTokensPage() {
  const [tokens, setTokens] = useState<TokenView[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdToken, setCreatedToken] = useState<CreatedToken | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [form, setForm] = useState({
    role: "ops" as AdminRole,
    label: "",
  });

  const createHint = useMemo(() => {
    if (!createdToken) return null;
    return "密钥仅显示一次，请立即保存";
  }, [createdToken]);

  const copyText = async (value: string, id?: string) => {
    if (!value) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      if (id) {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
      } else {
        setCopiedToken(true);
        setTimeout(() => setCopiedToken(false), 2000);
      }
    } catch {
      setError("复制失败，请稍后再试");
    }
  };

  const loadTokens = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/tokens");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || "加载失败");
        return;
      }
      const data = await res.json();
      setTokens(Array.isArray(data) ? data : []);
    } catch {
      setError("加载失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTokens();
  }, [loadTokens]);

  const createToken = async () => {
    if (creating) return;
    if (!form.role) {
      setError("请选择角色");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: form.role,
          label: form.label.trim() ? form.label.trim() : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "创建失败");
        return;
      }
      if (data?.item) {
        setTokens((prev) => [data.item as TokenView, ...prev]);
      } else {
        await loadTokens();
      }
      if (data?.token && data?.item?.id) {
        setCreatedToken({ token: data.token as string, id: data.item.id as string });
      } else {
        setCreatedToken(null);
      }
      setForm({ role: form.role, label: "" });
    } catch {
      setError("创建失败，请稍后再试");
    } finally {
      setCreating(false);
    }
  };

  const patchToken = async (tokenId: string, patch: Partial<AdminAccessToken>) => {
    if (saving[tokenId]) return;
    setSaving((prev) => ({ ...prev, [tokenId]: true }));
    setError(null);
    try {
      const res = await fetch(`/api/admin/tokens/${tokenId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "更新失败");
        await loadTokens();
        return;
      }
      setTokens((prev) => prev.map((item) => (item.id === tokenId ? (data as TokenView) : item)));
    } catch {
      setError("更新失败，请稍后再试");
      await loadTokens();
    } finally {
      setSaving((prev) => ({ ...prev, [tokenId]: false }));
    }
  };

  const removeToken = async (tokenId: string) => {
    if (saving[tokenId]) return;
    if (!confirm("确定要删除该密钥吗？删除后无法恢复。")) return;
    setSaving((prev) => ({ ...prev, [tokenId]: true }));
    setError(null);
    try {
      const res = await fetch(`/api/admin/tokens/${tokenId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || "删除失败");
        return;
      }
      setTokens((prev) => prev.filter((item) => item.id !== tokenId));
    } catch {
      setError("删除失败，请稍后再试");
    } finally {
      setSaving((prev) => ({ ...prev, [tokenId]: false }));
    }
  };

  return (
    <div className="admin-section">
      <div className="admin-card">
        <div className="admin-card-header">
          <div>
            <h3>创建后台密钥</h3>
            <p>生成新的后台访问密钥并配置角色权限。</p>
          </div>
          <div className="admin-card-actions">
            <button className="admin-btn ghost" onClick={loadTokens} disabled={loading}>
              <RefreshCw size={14} style={{ marginRight: 4 }} />
              刷新
            </button>
          </div>
        </div>
        <div className="admin-form" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <label className="admin-field">
            角色
            <select
              className="admin-select"
              value={form.role}
              onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value as AdminRole }))}
            >
              {ADMIN_ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>
                  {roleLabels[role] || role}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-field" style={{ gridColumn: "1 / -1" }}>
            备注
            <input
              className="admin-input"
              placeholder="例如：财务专用密钥"
              value={form.label}
              onChange={(event) => setForm((prev) => ({ ...prev, label: event.target.value }))}
            />
          </label>
        </div>
        <button className="admin-btn primary" onClick={createToken} disabled={creating}>
          {creating ? "创建中..." : "生成密钥"}
        </button>
        {error ? (
          <div style={{ marginTop: 12 }}>
            <StateBlock tone="warning" size="compact" title={error} />
          </div>
        ) : null}
        {createdToken ? (
          <div className="admin-card admin-card--subtle" style={{ marginTop: 14 }}>
            <div className="admin-card-header" style={{ alignItems: "center" }}>
              <div>
                <h4>密钥已生成</h4>
                <p>{createHint}</p>
              </div>
              <div className="admin-card-actions">
                <button
                  className="admin-btn ghost"
                  onClick={() => copyText(createdToken.token)}
                >
                  {copiedToken ? (
                    <>
                      <Check size={14} style={{ marginRight: 4 }} />已复制
                    </>
                  ) : (
                    <>
                      <Copy size={14} style={{ marginRight: 4 }} />复制密钥
                    </>
                  )}
                </button>
              </div>
            </div>
            <div className="admin-text-body" style={{ wordBreak: "break-all", fontFamily: "monospace" }}>
              {createdToken.token}
            </div>
          </div>
        ) : null}
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h3>密钥列表</h3>
          <div className="admin-card-actions">
            <span className="admin-pill">共 {tokens.length} 个</span>
          </div>
        </div>
        {loading ? (
          <StateBlock tone="loading" size="compact" title="加载中" description="正在同步密钥列表" />
        ) : tokens.length === 0 ? (
          <StateBlock tone="empty" size="compact" title="暂无密钥" description="请先创建后台密钥" />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>备注</th>
                  <th>角色</th>
                  <th>密钥前缀</th>
                  <th>状态</th>
                  <th>最后使用</th>
                  <th>创建时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((token) => (
                  <tr key={token.id}>
                    <td data-label="备注" style={{ minWidth: 180 }}>
                      <input
                        className="admin-input"
                        value={token.label || ""}
                        placeholder="-"
                        onChange={(event) => {
                          const value = event.target.value;
                          setTokens((prev) =>
                            prev.map((item) => (item.id === token.id ? { ...item, label: value } : item))
                          );
                        }}
                        onBlur={(event) => {
                          const value = event.target.value.trim();
                          const next = value ? value : "";
                          patchToken(token.id, { label: next });
                        }}
                      />
                    </td>
                    <td data-label="角色">
                      <select
                        className="admin-select"
                        value={token.role}
                        onChange={(event) =>
                          patchToken(token.id, { role: event.target.value as AdminRole })
                        }
                      >
                        {ADMIN_ROLE_OPTIONS.map((role) => (
                          <option key={role} value={role}>
                            {roleLabels[role] || role}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td data-label="密钥前缀">
                      <span className="admin-text-strong">{token.tokenPrefix}****</span>
                    </td>
                    <td data-label="状态">
                      <span className={`admin-badge ${token.status === "disabled" ? "neutral" : ""}`}>
                        {statusLabels[token.status] || token.status}
                      </span>
                    </td>
                    <td data-label="最后使用">{formatTime(token.lastUsedAt)}</td>
                    <td data-label="创建时间">{formatTime(token.createdAt)}</td>
                    <td data-label="操作">
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          className="admin-btn ghost"
                          onClick={() =>
                            patchToken(token.id, {
                              status: token.status === "active" ? "disabled" : "active",
                            })
                          }
                          disabled={saving[token.id]}
                        >
                          {token.status === "active" ? "禁用" : "启用"}
                        </button>
                        <button
                          className="admin-btn ghost"
                          onClick={() => copyText(token.tokenPrefix, token.id)}
                          disabled={saving[token.id]}
                        >
                          {copiedId === token.id ? (
                            <>
                              <Check size={14} style={{ marginRight: 4 }} />已复制前缀
                            </>
                          ) : (
                            <>
                              <Copy size={14} style={{ marginRight: 4 }} />复制前缀
                            </>
                          )}
                        </button>
                        <button
                          className="admin-btn ghost"
                          onClick={() => removeToken(token.id)}
                          disabled={saving[token.id]}
                        >
                          <Trash2 size={14} style={{ marginRight: 4 }} />删除
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
