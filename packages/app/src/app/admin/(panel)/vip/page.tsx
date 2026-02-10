"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PlusCircle, RefreshCw, Search } from "lucide-react";
import type {
  AdminMember,
  AdminMembershipRequest,
  AdminMembershipTier,
  MemberStatus,
  MembershipRequestStatus,
  MembershipTierStatus,
} from "@/lib/admin-types";
import {
  MEMBER_STATUS_OPTIONS,
  MEMBERSHIP_REQUEST_STATUS_OPTIONS,
  MEMBERSHIP_TIER_STATUS_OPTIONS,
} from "@/lib/admin-types";
import { readCache, writeCache } from "@/app/components/client-cache";
import { StateBlock } from "@/app/components/state-block";

function formatTime(ts: number) {
  return new Date(ts).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toDateInput(ts?: number | null) {
  if (!ts) return "";
  return new Date(ts).toISOString().slice(0, 10);
}

function formatPerks(perks?: AdminMembershipTier["perks"]) {
  if (!perks) return "";
  if (Array.isArray(perks)) {
    return perks
      .map((item) =>
        typeof item === "string" ? item : `${item.label}${item.desc ? `|${item.desc}` : ""}`
      )
      .join("\n");
  }
  return "";
}

function parsePerks(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.map((line) => {
    const [label, ...rest] = line.split("|");
    const desc = rest.join("|").trim();
    return desc ? { label: label.trim(), desc } : { label: label.trim() };
  });
}

export default function VipAdminPage() {
  const [tiers, setTiers] = useState<AdminMembershipTier[]>([]);
  const [requests, setRequests] = useState<AdminMembershipRequest[]>([]);
  const [members, setMembers] = useState<AdminMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("全部");
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const cacheTtlMs = 60_000;

  const [form, setForm] = useState({
    name: "",
    level: "",
    price: "",
    durationDays: "",
    minPoints: "",
    status: "上架" as MembershipTierStatus,
    perksText: "",
  });

  const [perksDraft, setPerksDraft] = useState<Record<string, string>>({});

  const loadTiers = useCallback(async () => {
    const cacheKey = "cache:admin:vip:tiers";
    const cached = readCache<AdminMembershipTier[]>(cacheKey, cacheTtlMs, true);
    if (cached) {
      const items = Array.isArray(cached.value) ? cached.value : [];
      setTiers(items);
      setPerksDraft((prev) => {
        const next = { ...prev };
        for (const item of items) {
          next[item.id] = formatPerks(item.perks);
        }
        return next;
      });
    }
    const res = await fetch(`/api/admin/vip/tiers?page=1&pageSize=200`);
    if (res.ok) {
      const data = await res.json();
      const items = Array.isArray(data?.items) ? data.items : [];
      setTiers(items);
      setPerksDraft((prev) => {
        const next = { ...prev };
        for (const item of items) {
          next[item.id] = formatPerks(item.perks);
        }
        return next;
      });
      writeCache(cacheKey, items);
    }
  }, [cacheTtlMs]);

  const loadRequests = useCallback(async (nextPage: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(nextPage));
      params.set("pageSize", String(pageSize));
      if (statusFilter && statusFilter !== "全部") params.set("status", statusFilter);
      if (query.trim()) params.set("q", query.trim());
      const cacheKey = `cache:admin:vip:requests:${params.toString()}`;
      const cached = readCache<{ items: AdminMembershipRequest[]; page?: number }>(cacheKey, cacheTtlMs, true);
      if (cached) {
        setRequests(Array.isArray(cached.value?.items) ? cached.value.items : []);
        setPage(cached.value?.page || nextPage);
      }
      const res = await fetch(`/api/admin/vip/requests?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const next = Array.isArray(data?.items) ? data.items : [];
        setRequests(next);
        setPage(data?.page || nextPage);
        writeCache(cacheKey, { items: next, page: data?.page || nextPage });
      }
    } finally {
      setLoading(false);
    }
  }, [cacheTtlMs, pageSize, query, statusFilter]);

  const loadMembers = useCallback(async () => {
    const cacheKey = "cache:admin:vip:members";
    const cached = readCache<AdminMember[]>(cacheKey, cacheTtlMs, true);
    if (cached) {
      setMembers(Array.isArray(cached.value) ? cached.value : []);
    }
    const res = await fetch(`/api/admin/vip/members?page=1&pageSize=200`);
    if (res.ok) {
      const data = await res.json();
      const next = Array.isArray(data?.items) ? data.items : [];
      setMembers(next);
      writeCache(cacheKey, next);
    }
  }, [cacheTtlMs]);

  useEffect(() => {
    loadTiers();
    loadMembers();
  }, [loadMembers, loadTiers]);

  useEffect(() => {
    const handle = setTimeout(() => loadRequests(1), 300);
    return () => clearTimeout(handle);
  }, [loadRequests]);

  useEffect(() => {
    loadRequests(page);
  }, [loadRequests, page]);

  const createTier = async () => {
    if (!form.name.trim() || !form.level) return;
    const res = await fetch("/api/admin/vip/tiers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name.trim(),
        level: Number(form.level),
        price: form.price ? Number(form.price) : undefined,
        durationDays: form.durationDays ? Number(form.durationDays) : undefined,
        minPoints: form.minPoints ? Number(form.minPoints) : undefined,
        status: form.status,
        perks: parsePerks(form.perksText),
      }),
    });
    if (res.ok) {
      await loadTiers();
      setForm({
        name: "",
        level: "",
        price: "",
        durationDays: "",
        minPoints: "",
        status: "上架",
        perksText: "",
      });
    }
  };

  const updateTier = async (tierId: string, patch: Partial<AdminMembershipTier>) => {
    setSaving((prev) => ({ ...prev, [tierId]: true }));
    try {
      const res = await fetch(`/api/admin/vip/tiers/${tierId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const data = await res.json();
        setTiers((prev) => {
          const next = prev.map((t) => (t.id === tierId ? data : t));
          writeCache("cache:admin:vip:tiers", next);
          return next;
        });
      }
    } finally {
      setSaving((prev) => ({ ...prev, [tierId]: false }));
    }
  };

  const updateRequest = async (requestId: string, patch: Partial<AdminMembershipRequest>) => {
    setSaving((prev) => ({ ...prev, [requestId]: true }));
    try {
      const res = await fetch(`/api/admin/vip/requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const data = await res.json();
        setRequests((prev) => {
          const next = prev.map((r) => (r.id === requestId ? data : r));
          const params = new URLSearchParams();
          params.set("page", String(page));
          params.set("pageSize", String(pageSize));
          if (statusFilter && statusFilter !== "全部") params.set("status", statusFilter);
          if (query.trim()) params.set("q", query.trim());
          writeCache(`cache:admin:vip:requests:${params.toString()}`, { items: next, page });
          return next;
        });
        await loadMembers();
      }
    } finally {
      setSaving((prev) => ({ ...prev, [requestId]: false }));
    }
  };

  const updateMember = async (memberId: string, patch: Partial<AdminMember>) => {
    setSaving((prev) => ({ ...prev, [memberId]: true }));
    try {
      const res = await fetch(`/api/admin/vip/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const data = await res.json();
        setMembers((prev) => {
          const next = prev.map((m) => (m.id === memberId ? data : m));
          writeCache("cache:admin:vip:members", next);
          return next;
        });
      }
    } finally {
      setSaving((prev) => ({ ...prev, [memberId]: false }));
    }
  };

  const totalActive = useMemo(() => tiers.filter((t) => t.status === "上架").length, [tiers]);

  return (
    <div className="admin-section">
      <div className="admin-card">
        <div className="admin-card-header">
          <div>
            <h3>新增会员等级</h3>
            <p>定义等级、权益与价格。</p>
          </div>
        </div>
        <div className="admin-form" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <label className="admin-field">
            等级名称
            <input
              className="admin-input"
              placeholder="坚韧白银"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            />
          </label>
          <label className="admin-field">
            等级序号
            <input
              className="admin-input"
              placeholder="1"
              value={form.level}
              onChange={(event) => setForm((prev) => ({ ...prev, level: event.target.value }))}
            />
          </label>
          <label className="admin-field">
            价格
            <input
              className="admin-input"
              placeholder="299"
              value={form.price}
              onChange={(event) => setForm((prev) => ({ ...prev, price: event.target.value }))}
            />
          </label>
          <label className="admin-field">
            有效期(天)
            <input
              className="admin-input"
              placeholder="30"
              value={form.durationDays}
              onChange={(event) => setForm((prev) => ({ ...prev, durationDays: event.target.value }))}
            />
          </label>
          <label className="admin-field">
            晋级所需成长值
            <input
              className="admin-input"
              placeholder="20000"
              value={form.minPoints}
              onChange={(event) => setForm((prev) => ({ ...prev, minPoints: event.target.value }))}
            />
          </label>
          <label className="admin-field">
            状态
            <select
              className="admin-select"
              value={form.status}
              onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as MembershipTierStatus }))}
            >
              {MEMBERSHIP_TIER_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-field" style={{ gridColumn: "1 / -1" }}>
            特权列表（每行：标题|描述）
            <textarea
              className="admin-textarea"
              placeholder="贵族铭牌|专属身份标识\n快速响应+|无限次"
              value={form.perksText}
              onChange={(event) => setForm((prev) => ({ ...prev, perksText: event.target.value }))}
            />
          </label>
        </div>
        <button className="admin-btn primary" onClick={createTier} style={{ marginTop: 14 }}>
          <PlusCircle size={16} style={{ marginRight: 6 }} />
          新建等级
        </button>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <div>
            <h3>会员申请筛选</h3>
            <p>按申请人、联系方式与状态过滤。</p>
          </div>
          <div className="admin-card-actions">
            <span className="admin-pill">上架 {totalActive} 个</span>
          </div>
        </div>
        <div className="admin-toolbar">
          <div className="admin-toolbar-grow" style={{ position: "relative" }}>
            <Search
              size={16}
              className="admin-input-icon"
            />
            <input
              className="admin-input"
              style={{ paddingLeft: 36 }}
              placeholder="搜索申请人 / 联系方式"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <select className="admin-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="全部">全部申请状态</option>
            {MEMBERSHIP_REQUEST_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <button className="admin-btn ghost" onClick={() => loadRequests(1)}>
            <RefreshCw size={16} style={{ marginRight: 6 }} />
            刷新申请
          </button>
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h3>会员等级列表</h3>
          <div className="admin-card-actions">
            <span className="admin-pill">共 {tiers.length} 条</span>
          </div>
        </div>
        {tiers.length === 0 ? (
          <StateBlock tone="empty" size="compact" title="暂无会员等级" description="先创建会员等级" />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>等级</th>
                  <th>价格</th>
                  <th>有效期</th>
                  <th>成长值</th>
                  <th>状态</th>
                  <th>特权</th>
                  <th>更新</th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((tier) => (
                  <tr key={tier.id}>
                    <td data-label="等级">
                      <div className="admin-text-strong">{tier.name}</div>
                      <div className="admin-meta">Lv.{tier.level}</div>
                    </td>
                    <td data-label="价格">
                      <input
                        className="admin-input"
                        value={tier.price ?? ""}
                        onChange={(event) =>
                          setTiers((prev) =>
                            prev.map((item) =>
                              item.id === tier.id
                                ? { ...item, price: event.target.value ? Number(event.target.value) : undefined }
                                : item
                            )
                          )
                        }
                        onBlur={(event) =>
                          updateTier(tier.id, {
                            price: event.target.value ? Number(event.target.value) : null,
                          })
                        }
                      />
                    </td>
                    <td data-label="有效期">
                      <input
                        className="admin-input"
                        value={tier.durationDays ?? ""}
                        onChange={(event) =>
                          setTiers((prev) =>
                            prev.map((item) =>
                              item.id === tier.id
                                ? { ...item, durationDays: event.target.value ? Number(event.target.value) : undefined }
                                : item
                            )
                          )
                        }
                        onBlur={(event) =>
                          updateTier(tier.id, {
                            durationDays: event.target.value ? Number(event.target.value) : null,
                          })
                        }
                      />
                    </td>
                    <td data-label="成长值">
                      <input
                        className="admin-input"
                        value={tier.minPoints ?? ""}
                        onChange={(event) =>
                          setTiers((prev) =>
                            prev.map((item) =>
                              item.id === tier.id
                                ? { ...item, minPoints: event.target.value ? Number(event.target.value) : undefined }
                                : item
                            )
                          )
                        }
                        onBlur={(event) =>
                          updateTier(tier.id, {
                            minPoints: event.target.value ? Number(event.target.value) : null,
                          })
                        }
                      />
                    </td>
                    <td data-label="状态">
                      <select
                        className="admin-select"
                        value={tier.status}
                        onChange={(event) => {
                          const nextStatus = event.target.value as MembershipTierStatus;
                          setTiers((prev) =>
                            prev.map((item) => (item.id === tier.id ? { ...item, status: nextStatus } : item))
                          );
                          updateTier(tier.id, { status: nextStatus });
                        }}
                      >
                        {MEMBERSHIP_TIER_STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td data-label="特权">
                      <textarea
                        className="admin-textarea"
                        value={perksDraft[tier.id] ?? ""}
                        onChange={(event) =>
                          setPerksDraft((prev) => ({ ...prev, [tier.id]: event.target.value }))
                        }
                        onBlur={(event) => updateTier(tier.id, { perks: parsePerks(event.target.value) })}
                      />
                    </td>
                    <td data-label="更新">
                      <span className="admin-badge neutral">{saving[tier.id] ? "保存中" : "已同步"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h3>会员申请</h3>
          <div className="admin-card-actions">
            <span className="admin-pill">本页 {requests.length} 条</span>
          </div>
        </div>
        {loading ? (
          <StateBlock tone="loading" size="compact" title="加载中" description="正在同步会员申请" />
        ) : requests.length === 0 ? (
          <StateBlock tone="empty" size="compact" title="暂无会员申请" description="暂无待处理申请" />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>用户</th>
                  <th>等级</th>
                  <th>联系方式</th>
                  <th>状态</th>
                  <th>备注</th>
                  <th>时间</th>
                  <th>更新</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((req) => (
                  <tr key={req.id}>
                    <td data-label="用户">
                      <div className="admin-text-strong">{req.userName || "访客"}</div>
                      <div className="admin-meta">{req.userAddress || "-"}</div>
                      <div className="admin-meta-faint">{req.id}</div>
                    </td>
                    <td data-label="等级">{req.tierName || "-"}</td>
                    <td data-label="联系方式" className="admin-meta">
                      {req.contact || "-"}
                    </td>
                    <td data-label="状态">
                      <select
                        className="admin-select"
                        value={req.status}
                        onChange={(event) => {
                          const nextStatus = event.target.value as MembershipRequestStatus;
                          setRequests((prev) =>
                            prev.map((item) => (item.id === req.id ? { ...item, status: nextStatus } : item))
                          );
                          updateRequest(req.id, { status: nextStatus });
                        }}
                      >
                        {MEMBERSHIP_REQUEST_STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td data-label="备注">
                      <input
                        className="admin-input"
                        placeholder="审核备注"
                        value={req.note || ""}
                        onChange={(event) =>
                          setRequests((prev) =>
                            prev.map((item) =>
                              item.id === req.id ? { ...item, note: event.target.value } : item
                            )
                          )
                        }
                        onBlur={(event) => updateRequest(req.id, { note: event.target.value })}
                      />
                    </td>
                    <td data-label="时间">{formatTime(req.createdAt)}</td>
                    <td data-label="更新">
                      <span className="admin-badge neutral">{saving[req.id] ? "保存中" : "已同步"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h3>会员列表</h3>
          <div className="admin-card-actions">
            <span className="admin-pill">共 {members.length} 条</span>
          </div>
        </div>
        {members.length === 0 ? (
          <StateBlock tone="empty" size="compact" title="暂无会员记录" description="当前没有会员记录" />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>用户</th>
                  <th>等级</th>
                  <th>成长值</th>
                  <th>有效期</th>
                  <th>状态</th>
                  <th>备注</th>
                  <th>更新</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id}>
                    <td data-label="用户">
                      <div className="admin-text-strong">{member.userName || "-"}</div>
                      <div className="admin-meta">{member.userAddress || "-"}</div>
                    </td>
                    <td data-label="等级">{member.tierName || "-"}</td>
                    <td data-label="成长值">
                      <input
                        className="admin-input"
                        value={member.points ?? ""}
                        onChange={(event) =>
                          setMembers((prev) =>
                            prev.map((item) =>
                              item.id === member.id
                                ? { ...item, points: event.target.value ? Number(event.target.value) : undefined }
                                : item
                            )
                          )
                        }
                        onBlur={(event) =>
                          updateMember(member.id, {
                            points: event.target.value ? Number(event.target.value) : null,
                          })
                        }
                      />
                    </td>
                    <td data-label="有效期">
                      <input
                        className="admin-input"
                        type="date"
                        value={toDateInput(member.expiresAt)}
                        onChange={(event) =>
                          setMembers((prev) =>
                            prev.map((item) =>
                              item.id === member.id
                                ? { ...item, expiresAt: event.target.value ? new Date(event.target.value).getTime() : undefined }
                                : item
                            )
                          )
                        }
                        onBlur={(event) =>
                          updateMember(member.id, {
                            expiresAt: event.target.value ? new Date(event.target.value).getTime() : null,
                          })
                        }
                      />
                    </td>
                    <td data-label="状态">
                      <select
                        className="admin-select"
                        value={member.status}
                        onChange={(event) => {
                          const nextStatus = event.target.value as MemberStatus;
                          setMembers((prev) =>
                            prev.map((item) => (item.id === member.id ? { ...item, status: nextStatus } : item))
                          );
                          updateMember(member.id, { status: nextStatus });
                        }}
                      >
                        {MEMBER_STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td data-label="备注">
                      <input
                        className="admin-input"
                        placeholder="备注"
                        value={member.note || ""}
                        onChange={(event) =>
                          setMembers((prev) =>
                            prev.map((item) =>
                              item.id === member.id ? { ...item, note: event.target.value } : item
                            )
                          )
                        }
                        onBlur={(event) => updateMember(member.id, { note: event.target.value })}
                      />
                    </td>
                    <td data-label="更新">
                      <span className="admin-badge neutral">{saving[member.id] ? "保存中" : "已同步"}</span>
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
