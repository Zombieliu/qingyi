"use client";
import { t } from "@/lib/i18n/i18n-client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PlusCircle, RefreshCw, Search } from "lucide-react";
import type {
  AdminMember,
  AdminMembershipRequest,
  AdminMembershipTier,
  MemberStatus,
  MembershipRequestStatus,
  MembershipTierStatus,
} from "@/lib/admin/admin-types";
import {
  MEMBER_STATUS_OPTIONS,
  MEMBERSHIP_REQUEST_STATUS_OPTIONS,
  MEMBERSHIP_TIER_STATUS_OPTIONS,
} from "@/lib/admin/admin-types";
import { readCache, writeCache } from "@/lib/shared/client-cache";
import { formatShortDateTime, formatDateISO } from "@/lib/shared/date-utils";
import { StateBlock } from "@/app/components/state-block";

function toDateInput(ts?: number | null) {
  if (!ts) return "";
  return formatDateISO(ts);
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
  const [cacheHint, setCacheHint] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState(t("admin.vip.001"));
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(1);
  const [cursor, setCursor] = useState<string | null>(null);
  const [prevCursors, setPrevCursors] = useState<Array<string | null>>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
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

  const loadRequests = useCallback(
    async (cursorValue: string | null, nextPage: number) => {
      setLoading(true);
      try {
        setCacheHint(null);
        const params = new URLSearchParams();
        params.set("pageSize", String(pageSize));
        if (cursorValue) params.set("cursor", cursorValue);
        if (statusFilter && statusFilter !== "全部") params.set("status", statusFilter);
        if (query.trim()) params.set("q", query.trim());
        const cacheKey = `cache:admin:vip:requests:${params.toString()}`;
        const cached = readCache<{ items: AdminMembershipRequest[]; nextCursor?: string | null }>(
          cacheKey,
          cacheTtlMs,
          true
        );
        if (cached) {
          setRequests(Array.isArray(cached.value?.items) ? cached.value.items : []);
          setPage(nextPage);
          setNextCursor(cached.value?.nextCursor || null);
          setCacheHint(cached.fresh ? null : t("admin.vip.002"));
        }
        const res = await fetch(`/api/admin/vip/requests?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          const next = Array.isArray(data?.items) ? data.items : [];
          setRequests(next);
          setPage(nextPage);
          setNextCursor(data?.nextCursor || null);
          setCacheHint(null);
          writeCache(cacheKey, { items: next, nextCursor: data?.nextCursor || null });
        }
      } finally {
        setLoading(false);
      }
    },
    [cacheTtlMs, pageSize, query, statusFilter]
  );

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
    const handle = setTimeout(() => {
      setPrevCursors([]);
      setCursor(null);
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [query, statusFilter]);

  useEffect(() => {
    loadRequests(cursor, page);
  }, [loadRequests, cursor, page]);

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
          params.set("pageSize", String(pageSize));
          if (cursor) params.set("cursor", cursor);
          if (statusFilter && statusFilter !== "全部") params.set("status", statusFilter);
          if (query.trim()) params.set("q", query.trim());
          writeCache(`cache:admin:vip:requests:${params.toString()}`, { items: next, nextCursor });
          return next;
        });
        await loadMembers();
      }
    } finally {
      setSaving((prev) => ({ ...prev, [requestId]: false }));
    }
  };

  const goPrev = () => {
    setPrevCursors((prev) => {
      if (prev.length === 0) return prev;
      const nextPrev = prev.slice(0, -1);
      const prevCursor = prev[prev.length - 1] ?? null;
      setCursor(prevCursor);
      setPage((value) => Math.max(1, value - 1));
      return nextPrev;
    });
  };

  const goNext = () => {
    if (!nextCursor) return;
    setPrevCursors((prev) => [...prev, cursor]);
    setCursor(nextCursor);
    setPage((value) => value + 1);
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
            <h3>{t("ui.vip.203")}</h3>
            <p>{t("ui.vip.204")}</p>
          </div>
        </div>
        <div
          className="admin-form"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}
        >
          <label className="admin-field">
            等级名称
            <input
              className="admin-input"
              placeholder={t("admin.vip.003")}
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
              onChange={(event) =>
                setForm((prev) => ({ ...prev, durationDays: event.target.value }))
              }
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
              onChange={(event) =>
                setForm((prev) => ({ ...prev, status: event.target.value as MembershipTierStatus }))
              }
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
              placeholder={t("admin.vip.004")}
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
            <h3>{t("ui.vip.205")}</h3>
            <p>{t("ui.vip.206")}</p>
          </div>
          <div className="admin-card-actions">
            <span className="admin-pill">上架 {totalActive} 个</span>
          </div>
        </div>
        <div className="admin-toolbar">
          <div className="admin-toolbar-grow" style={{ position: "relative" }}>
            <Search size={16} className="admin-input-icon" />
            <input
              className="admin-input"
              style={{ paddingLeft: 36 }}
              placeholder={t("admin.vip.005")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <select
            className="admin-select"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value={t("admin.vip.006")}>{t("ui.vip.207")}</option>
            {MEMBERSHIP_REQUEST_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <button
            className="admin-btn ghost"
            onClick={() => {
              setPrevCursors([]);
              setCursor(null);
              setPage(1);
            }}
          >
            <RefreshCw size={16} style={{ marginRight: 6 }} />
            刷新申请
          </button>
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h3>{t("ui.vip.208")}</h3>
          <div className="admin-card-actions">
            <span className="admin-pill">共 {tiers.length} 条</span>
          </div>
        </div>
        {tiers.length === 0 ? (
          <StateBlock
            tone="empty"
            size="compact"
            title={t("admin.vip.007")}
            description={t("admin.vip.008")}
          />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t("ui.vip.209")}</th>
                  <th>{t("ui.vip.210")}</th>
                  <th>{t("ui.vip.211")}</th>
                  <th>{t("ui.vip.212")}</th>
                  <th>{t("ui.vip.213")}</th>
                  <th>{t("ui.vip.214")}</th>
                  <th>{t("ui.vip.215")}</th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((tier) => (
                  <tr key={tier.id}>
                    <td data-label={t("admin.vip.009")}>
                      <div className="admin-text-strong">{tier.name}</div>
                      <div className="admin-meta">Lv.{tier.level}</div>
                    </td>
                    <td data-label={t("admin.vip.010")}>
                      <input
                        className="admin-input"
                        value={tier.price ?? ""}
                        onChange={(event) =>
                          setTiers((prev) =>
                            prev.map((item) =>
                              item.id === tier.id
                                ? {
                                    ...item,
                                    price: event.target.value
                                      ? Number(event.target.value)
                                      : undefined,
                                  }
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
                    <td data-label={t("admin.vip.011")}>
                      <input
                        className="admin-input"
                        value={tier.durationDays ?? ""}
                        onChange={(event) =>
                          setTiers((prev) =>
                            prev.map((item) =>
                              item.id === tier.id
                                ? {
                                    ...item,
                                    durationDays: event.target.value
                                      ? Number(event.target.value)
                                      : undefined,
                                  }
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
                    <td data-label={t("admin.vip.012")}>
                      <input
                        className="admin-input"
                        value={tier.minPoints ?? ""}
                        onChange={(event) =>
                          setTiers((prev) =>
                            prev.map((item) =>
                              item.id === tier.id
                                ? {
                                    ...item,
                                    minPoints: event.target.value
                                      ? Number(event.target.value)
                                      : undefined,
                                  }
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
                    <td data-label={t("admin.vip.013")}>
                      <select
                        className="admin-select"
                        value={tier.status}
                        onChange={(event) => {
                          const nextStatus = event.target.value as MembershipTierStatus;
                          setTiers((prev) =>
                            prev.map((item) =>
                              item.id === tier.id ? { ...item, status: nextStatus } : item
                            )
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
                    <td data-label={t("admin.vip.014")}>
                      <textarea
                        className="admin-textarea"
                        value={perksDraft[tier.id] ?? ""}
                        onChange={(event) =>
                          setPerksDraft((prev) => ({ ...prev, [tier.id]: event.target.value }))
                        }
                        onBlur={(event) =>
                          updateTier(tier.id, { perks: parsePerks(event.target.value) })
                        }
                      />
                    </td>
                    <td data-label={t("admin.vip.015")}>
                      <span className="admin-badge neutral">
                        {saving[tier.id] ? t("ui.vip.520") : t("admin.vip.016")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="admin-pagination">
          <button className="admin-btn ghost" disabled={prevCursors.length === 0} onClick={goPrev}>
            上一页
          </button>
          <div className="admin-meta">第 {page} 页</div>
          <button className="admin-btn ghost" disabled={!nextCursor} onClick={goNext}>
            下一页
          </button>
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h3>{t("ui.vip.216")}</h3>
          <div className="admin-card-actions">
            <span className="admin-pill">本页 {requests.length} 条</span>
            {cacheHint ? <span className="admin-pill">{cacheHint}</span> : null}
          </div>
        </div>
        {loading ? (
          <StateBlock
            tone="loading"
            size="compact"
            title={t("admin.vip.018")}
            description={t("admin.vip.017")}
          />
        ) : requests.length === 0 ? (
          <StateBlock
            tone="empty"
            size="compact"
            title={t("admin.vip.019")}
            description={t("admin.vip.020")}
          />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t("ui.vip.217")}</th>
                  <th>{t("ui.vip.218")}</th>
                  <th>{t("ui.vip.219")}</th>
                  <th>{t("ui.vip.220")}</th>
                  <th>{t("ui.vip.221")}</th>
                  <th>{t("ui.vip.222")}</th>
                  <th>{t("ui.vip.223")}</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((req) => (
                  <tr key={req.id}>
                    <td data-label={t("admin.vip.021")}>
                      <div className="admin-text-strong">{req.userName || t("ui.vip.671")}</div>
                      <div className="admin-meta">{req.userAddress || "-"}</div>
                      <div className="admin-meta-faint">{req.id}</div>
                    </td>
                    <td data-label={t("admin.vip.022")}>{req.tierName || "-"}</td>
                    <td data-label={t("admin.vip.023")} className="admin-meta">
                      {req.contact || "-"}
                    </td>
                    <td data-label={t("admin.vip.024")}>
                      <select
                        className="admin-select"
                        value={req.status}
                        onChange={(event) => {
                          const nextStatus = event.target.value as MembershipRequestStatus;
                          setRequests((prev) =>
                            prev.map((item) =>
                              item.id === req.id ? { ...item, status: nextStatus } : item
                            )
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
                    <td data-label={t("admin.vip.025")}>
                      <input
                        className="admin-input"
                        placeholder={t("admin.vip.026")}
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
                    <td data-label={t("admin.vip.027")}>{formatShortDateTime(req.createdAt)}</td>
                    <td data-label={t("admin.vip.028")}>
                      <span className="admin-badge neutral">
                        {saving[req.id] ? t("ui.vip.521") : t("admin.vip.029")}
                      </span>
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
          <h3>{t("ui.vip.224")}</h3>
          <div className="admin-card-actions">
            <span className="admin-pill">共 {members.length} 条</span>
          </div>
        </div>
        {members.length === 0 ? (
          <StateBlock
            tone="empty"
            size="compact"
            title={t("admin.vip.030")}
            description={t("admin.vip.031")}
          />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t("ui.vip.225")}</th>
                  <th>{t("ui.vip.226")}</th>
                  <th>{t("ui.vip.227")}</th>
                  <th>{t("ui.vip.228")}</th>
                  <th>{t("ui.vip.229")}</th>
                  <th>{t("ui.vip.230")}</th>
                  <th>{t("ui.vip.231")}</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id}>
                    <td data-label={t("admin.vip.032")}>
                      <div className="admin-text-strong">{member.userName || "-"}</div>
                      <div className="admin-meta">{member.userAddress || "-"}</div>
                    </td>
                    <td data-label={t("admin.vip.033")}>{member.tierName || "-"}</td>
                    <td data-label={t("admin.vip.034")}>
                      <input
                        className="admin-input"
                        value={member.points ?? ""}
                        onChange={(event) =>
                          setMembers((prev) =>
                            prev.map((item) =>
                              item.id === member.id
                                ? {
                                    ...item,
                                    points: event.target.value
                                      ? Number(event.target.value)
                                      : undefined,
                                  }
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
                    <td data-label={t("admin.vip.035")}>
                      <input
                        className="admin-input"
                        type="date"
                        value={toDateInput(member.expiresAt)}
                        onChange={(event) =>
                          setMembers((prev) =>
                            prev.map((item) =>
                              item.id === member.id
                                ? {
                                    ...item,
                                    expiresAt: event.target.value
                                      ? new Date(event.target.value).getTime()
                                      : undefined,
                                  }
                                : item
                            )
                          )
                        }
                        onBlur={(event) =>
                          updateMember(member.id, {
                            expiresAt: event.target.value
                              ? new Date(event.target.value).getTime()
                              : null,
                          })
                        }
                      />
                    </td>
                    <td data-label={t("admin.vip.036")}>
                      <select
                        className="admin-select"
                        value={member.status}
                        onChange={(event) => {
                          const nextStatus = event.target.value as MemberStatus;
                          setMembers((prev) =>
                            prev.map((item) =>
                              item.id === member.id ? { ...item, status: nextStatus } : item
                            )
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
                    <td data-label={t("admin.vip.037")}>
                      <input
                        className="admin-input"
                        placeholder={t("admin.vip.038")}
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
                    <td data-label={t("admin.vip.039")}>
                      <span className="admin-badge neutral">
                        {saving[member.id] ? t("ui.vip.522") : t("admin.vip.040")}
                      </span>
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
