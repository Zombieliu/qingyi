"use client";
import { t } from "@/lib/i18n/t";

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
import { VipTiersTable } from "./vip-tiers-table";
import { VipRequestsTable } from "./vip-requests-table";
import { VipMembersTable } from "./vip-members-table";

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
        if (statusFilter && statusFilter !== t("admin.panel.vip.i095"))
          params.set("status", statusFilter);
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
          if (statusFilter && statusFilter !== t("admin.panel.vip.i096"))
            params.set("status", statusFilter);
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

  const totalActive = useMemo(
    () => tiers.filter((tier) => tier.status === t("admin.panel.vip.i097")).length,
    [tiers]
  );

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

      <VipTiersTable
        tiers={tiers}
        perksDraft={perksDraft}
        saving={saving}
        page={page}
        nextCursor={nextCursor}
        prevCursors={prevCursors}
        totalActive={totalActive}
        setTiers={setTiers}
        setPerksDraft={setPerksDraft}
        updateTier={updateTier}
        goNext={goNext}
        goPrev={goPrev}
        parsePerks={parsePerks}
      />

      <VipRequestsTable
        requests={requests}
        loading={loading}
        saving={saving}
        cacheHint={cacheHint}
        setRequests={setRequests}
        updateRequest={updateRequest}
      />

      <VipMembersTable
        members={members}
        saving={saving}
        setMembers={setMembers}
        updateMember={updateMember}
      />
    </div>
  );
}
