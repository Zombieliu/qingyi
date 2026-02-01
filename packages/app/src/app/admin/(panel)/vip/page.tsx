"use client";

import { useEffect, useMemo, useState } from "react";
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

function formatTime(ts: number) {
  return new Date(ts).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toDateInput(ts?: number) {
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
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 20;

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

  const loadTiers = async () => {
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
    }
  };

  const loadRequests = async (nextPage = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(nextPage));
      params.set("pageSize", String(pageSize));
      if (statusFilter && statusFilter !== "全部") params.set("status", statusFilter);
      if (query.trim()) params.set("q", query.trim());
      const res = await fetch(`/api/admin/vip/requests?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setRequests(Array.isArray(data?.items) ? data.items : []);
        setPage(data?.page || nextPage);
        setTotalPages(data?.totalPages || 1);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadMembers = async () => {
    const res = await fetch(`/api/admin/vip/members?page=1&pageSize=200`);
    if (res.ok) {
      const data = await res.json();
      setMembers(Array.isArray(data?.items) ? data.items : []);
    }
  };

  useEffect(() => {
    loadTiers();
    loadMembers();
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => loadRequests(1), 300);
    return () => clearTimeout(handle);
  }, [query, statusFilter]);

  useEffect(() => {
    loadRequests(page);
  }, [page]);

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
        setTiers((prev) => prev.map((t) => (t.id === tierId ? data : t)));
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
        setRequests((prev) => prev.map((r) => (r.id === requestId ? data : r)));
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
        setMembers((prev) => prev.map((m) => (m.id === memberId ? data : m)));
      }
    } finally {
      setSaving((prev) => ({ ...prev, [memberId]: false }));
    }
  };

  const totalActive = useMemo(() => tiers.filter((t) => t.status === "上架").length, [tiers]);

  return (
    <div className="admin-section">
      <div className="admin-card">
        <h3>新增会员等级</h3>
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
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <div style={{ flex: 1, minWidth: 220, position: "relative" }}>
            <Search
              size={16}
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "#64748b",
              }}
            />
            <input
              className="admin-input"
              style={{ paddingLeft: 36 }}
              placeholder="搜索申请人 / 联系方式"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <select
            className="admin-select"
            style={{ minWidth: 160 }}
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
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
          <span className="admin-badge neutral">上架 {totalActive} 个</span>
        </div>
      </div>

      <div className="admin-card">
        {tiers.length === 0 ? (
          <p>暂无会员等级</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
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
                    <td>
                      <div style={{ fontWeight: 600 }}>{tier.name}</div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>Lv.{tier.level}</div>
                    </td>
                    <td>
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
                    <td>
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
                    <td>
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
                    <td>
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
                    <td>
                      <textarea
                        className="admin-textarea"
                        value={perksDraft[tier.id] ?? ""}
                        onChange={(event) =>
                          setPerksDraft((prev) => ({ ...prev, [tier.id]: event.target.value }))
                        }
                        onBlur={(event) => updateTier(tier.id, { perks: parsePerks(event.target.value) })}
                      />
                    </td>
                    <td>
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
        <h3>会员申请</h3>
        {loading ? (
          <p>加载中...</p>
        ) : requests.length === 0 ? (
          <p>暂无会员申请</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
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
                    <td>
                      <div style={{ fontWeight: 600 }}>{req.userName || "访客"}</div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>{req.userAddress || "-"}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>{req.id}</div>
                    </td>
                    <td>{req.tierName || "-"}</td>
                    <td style={{ fontSize: 12, color: "#64748b" }}>{req.contact || "-"}</td>
                    <td>
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
                    <td>
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
                    <td>{formatTime(req.createdAt)}</td>
                    <td>
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
        <h3>会员列表</h3>
        {members.length === 0 ? (
          <p>暂无会员记录</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
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
                    <td>
                      <div style={{ fontWeight: 600 }}>{member.userName || "-"}</div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>{member.userAddress || "-"}</div>
                    </td>
                    <td>{member.tierName || "-"}</td>
                    <td>
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
                    <td>
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
                    <td>
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
                    <td>
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
                    <td>
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
