"use client";
import { t } from "@/lib/i18n/i18n-client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PlusCircle, RefreshCw, Search } from "lucide-react";
import type { AdminCoupon, CouponStatus } from "@/lib/admin/admin-types";
import { COUPON_STATUS_OPTIONS } from "@/lib/admin/admin-types";
import { readCache, writeCache } from "@/lib/shared/client-cache";
import { StateBlock } from "@/app/components/state-block";
import { formatDateISO } from "@/lib/shared/date-utils";

function toDateInput(ts?: number | null) {
  if (!ts) return "";
  return formatDateISO(ts);
}

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<AdminCoupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [cacheHint, setCacheHint] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState(t("admin.coupons.001"));
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(1);
  const [cursor, setCursor] = useState<string | null>(null);
  const [prevCursors, setPrevCursors] = useState<Array<string | null>>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const pageSize = 20;
  const cacheTtlMs = 60_000;

  const [form, setForm] = useState({
    title: "",
    code: "",
    discount: "",
    minSpend: "",
    status: "可用" as CouponStatus,
    startsAt: "",
    expiresAt: "",
    description: "",
  });

  const load = useCallback(
    async (cursorValue: string | null, nextPage: number) => {
      setLoading(true);
      try {
        setCacheHint(null);
        const params = new URLSearchParams();
        params.set("pageSize", String(pageSize));
        if (cursorValue) params.set("cursor", cursorValue);
        if (statusFilter && statusFilter !== "全部") params.set("status", statusFilter);
        if (query.trim()) params.set("q", query.trim());
        const cacheKey = `cache:admin:coupons:${params.toString()}`;
        const cached = readCache<{ items: AdminCoupon[]; nextCursor?: string | null }>(
          cacheKey,
          cacheTtlMs,
          true
        );
        if (cached) {
          setCoupons(Array.isArray(cached.value?.items) ? cached.value.items : []);
          setPage(nextPage);
          setNextCursor(cached.value?.nextCursor || null);
          setCacheHint(cached.fresh ? null : t("admin.coupons.002"));
        }
        const res = await fetch(`/api/admin/coupons?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          const next = Array.isArray(data?.items) ? data.items : [];
          setCoupons(next);
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

  useEffect(() => {
    const handle = setTimeout(() => {
      setPrevCursors([]);
      setCursor(null);
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [query, statusFilter]);

  useEffect(() => {
    load(cursor, page);
  }, [load, cursor, page]);

  const createCoupon = async () => {
    if (!form.title.trim()) return;
    const res = await fetch("/api/admin/coupons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title.trim(),
        code: form.code.trim(),
        discount: form.discount ? Number(form.discount) : undefined,
        minSpend: form.minSpend ? Number(form.minSpend) : undefined,
        status: form.status,
        startsAt: form.startsAt || undefined,
        expiresAt: form.expiresAt || undefined,
        description: form.description.trim(),
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setCoupons((prev) => {
        const next = [data, ...prev];
        const params = new URLSearchParams();
        params.set("pageSize", String(pageSize));
        if (cursor) params.set("cursor", cursor);
        if (statusFilter && statusFilter !== "全部") params.set("status", statusFilter);
        if (query.trim()) params.set("q", query.trim());
        writeCache(`cache:admin:coupons:${params.toString()}`, { items: next, nextCursor });
        return next;
      });
      setForm({
        title: "",
        code: "",
        discount: "",
        minSpend: "",
        status: "可用",
        startsAt: "",
        expiresAt: "",
        description: "",
      });
    }
  };

  const updateCoupon = async (couponId: string, patch: Partial<AdminCoupon>) => {
    setSaving((prev) => ({ ...prev, [couponId]: true }));
    try {
      const res = await fetch(`/api/admin/coupons/${couponId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const data = await res.json();
        setCoupons((prev) => {
          const next = prev.map((c) => (c.id === couponId ? data : c));
          const params = new URLSearchParams();
          params.set("pageSize", String(pageSize));
          if (cursor) params.set("cursor", cursor);
          if (statusFilter && statusFilter !== "全部") params.set("status", statusFilter);
          if (query.trim()) params.set("q", query.trim());
          writeCache(`cache:admin:coupons:${params.toString()}`, { items: next, nextCursor });
          return next;
        });
      }
    } finally {
      setSaving((prev) => ({ ...prev, [couponId]: false }));
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

  const totalActive = useMemo(() => coupons.filter((c) => c.status === "可用").length, [coupons]);

  return (
    <div className="admin-section">
      <div className="admin-card">
        <div className="admin-card-header">
          <div>
            <h3>{t("ui.coupons.333")}</h3>
            <p>{t("ui.coupons.334")}</p>
          </div>
        </div>
        <div
          className="admin-form"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}
        >
          <label className="admin-field">
            标题
            <input
              className="admin-input"
              placeholder={t("admin.coupons.003")}
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            />
          </label>
          <label className="admin-field">
            兑换码
            <input
              className="admin-input"
              placeholder={t("admin.coupons.004")}
              value={form.code}
              onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))}
            />
          </label>
          <label className="admin-field">
            立减金额
            <input
              className="admin-input"
              placeholder={t("admin.coupons.005")}
              value={form.discount}
              onChange={(event) => setForm((prev) => ({ ...prev, discount: event.target.value }))}
            />
          </label>
          <label className="admin-field">
            最低消费
            <input
              className="admin-input"
              placeholder={t("admin.coupons.006")}
              value={form.minSpend}
              onChange={(event) => setForm((prev) => ({ ...prev, minSpend: event.target.value }))}
            />
          </label>
          <label className="admin-field">
            状态
            <select
              className="admin-select"
              value={form.status}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, status: event.target.value as CouponStatus }))
              }
            >
              {COUPON_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            生效日期
            <input
              className="admin-input"
              type="date"
              value={form.startsAt}
              onChange={(event) => setForm((prev) => ({ ...prev, startsAt: event.target.value }))}
            />
          </label>
          <label className="admin-field">
            失效日期
            <input
              className="admin-input"
              type="date"
              value={form.expiresAt}
              onChange={(event) => setForm((prev) => ({ ...prev, expiresAt: event.target.value }))}
            />
          </label>
          <label className="admin-field" style={{ gridColumn: "1 / -1" }}>
            说明
            <input
              className="admin-input"
              placeholder={t("admin.coupons.007")}
              value={form.description}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, description: event.target.value }))
              }
            />
          </label>
        </div>
        <button className="admin-btn primary" onClick={createCoupon} style={{ marginTop: 14 }}>
          <PlusCircle size={16} style={{ marginRight: 6 }} />
          新建优惠券
        </button>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <div>
            <h3>{t("ui.coupons.335")}</h3>
            <p>{t("ui.coupons.336")}</p>
          </div>
          <div className="admin-card-actions">
            <span className="admin-pill">可用 {totalActive} 张</span>
          </div>
        </div>
        <div className="admin-toolbar">
          <div className="admin-toolbar-grow" style={{ position: "relative" }}>
            <Search size={16} className="admin-input-icon" />
            <input
              className="admin-input"
              style={{ paddingLeft: 36 }}
              placeholder={t("admin.coupons.008")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <select
            className="admin-select"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value={t("admin.coupons.009")}>{t("ui.coupons.337")}</option>
            {COUPON_STATUS_OPTIONS.map((status) => (
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
            刷新
          </button>
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h3>{t("ui.coupons.338")}</h3>
          <div className="admin-card-actions">
            <span className="admin-pill">共 {coupons.length} 条</span>
            {cacheHint ? <span className="admin-pill">{cacheHint}</span> : null}
          </div>
        </div>
        {loading ? (
          <StateBlock
            tone="loading"
            size="compact"
            title={t("admin.coupons.010")}
            description={t("admin.coupons.011")}
          />
        ) : coupons.length === 0 ? (
          <StateBlock
            tone="empty"
            size="compact"
            title={t("admin.coupons.013")}
            description={t("admin.coupons.012")}
          />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t("ui.coupons.339")}</th>
                  <th>{t("ui.coupons.340")}</th>
                  <th>{t("ui.coupons.341")}</th>
                  <th>{t("ui.coupons.342")}</th>
                  <th>{t("ui.coupons.343")}</th>
                  <th>{t("ui.coupons.344")}</th>
                  <th>{t("ui.coupons.345")}</th>
                </tr>
              </thead>
              <tbody>
                {coupons.map((coupon) => (
                  <tr key={coupon.id}>
                    <td data-label={t("admin.coupons.014")}>
                      <div className="admin-text-strong">{coupon.title}</div>
                      <div className="admin-meta">{coupon.code || "-"}</div>
                    </td>
                    <td data-label={t("admin.coupons.015")}>
                      <input
                        className="admin-input"
                        value={coupon.discount ?? ""}
                        onChange={(event) => {
                          const value = event.target.value;
                          const next = value ? Number(value) : undefined;
                          setCoupons((prev) =>
                            prev.map((item) =>
                              item.id === coupon.id ? { ...item, discount: next } : item
                            )
                          );
                        }}
                        onBlur={(event) =>
                          updateCoupon(coupon.id, {
                            discount: event.target.value ? Number(event.target.value) : null,
                          })
                        }
                      />
                    </td>
                    <td data-label={t("admin.coupons.016")}>
                      <input
                        className="admin-input"
                        value={coupon.minSpend ?? ""}
                        onChange={(event) => {
                          const value = event.target.value;
                          const next = value ? Number(value) : undefined;
                          setCoupons((prev) =>
                            prev.map((item) =>
                              item.id === coupon.id ? { ...item, minSpend: next } : item
                            )
                          );
                        }}
                        onBlur={(event) =>
                          updateCoupon(coupon.id, {
                            minSpend: event.target.value ? Number(event.target.value) : null,
                          })
                        }
                      />
                    </td>
                    <td data-label={t("admin.coupons.017")}>
                      <select
                        className="admin-select"
                        value={coupon.status}
                        onChange={(event) => {
                          const nextStatus = event.target.value as CouponStatus;
                          setCoupons((prev) =>
                            prev.map((item) =>
                              item.id === coupon.id ? { ...item, status: nextStatus } : item
                            )
                          );
                          updateCoupon(coupon.id, { status: nextStatus });
                        }}
                      >
                        {COUPON_STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td data-label={t("admin.coupons.018")}>
                      <input
                        className="admin-input"
                        type="date"
                        value={toDateInput(coupon.startsAt)}
                        onChange={(event) => {
                          const value = event.target.value;
                          setCoupons((prev) =>
                            prev.map((item) =>
                              item.id === coupon.id
                                ? {
                                    ...item,
                                    startsAt: value ? new Date(value).getTime() : undefined,
                                  }
                                : item
                            )
                          );
                        }}
                        onBlur={(event) =>
                          updateCoupon(coupon.id, {
                            startsAt: event.target.value
                              ? new Date(event.target.value).getTime()
                              : null,
                          })
                        }
                      />
                      <input
                        className="admin-input"
                        type="date"
                        value={toDateInput(coupon.expiresAt)}
                        onChange={(event) => {
                          const value = event.target.value;
                          setCoupons((prev) =>
                            prev.map((item) =>
                              item.id === coupon.id
                                ? {
                                    ...item,
                                    expiresAt: value ? new Date(value).getTime() : undefined,
                                  }
                                : item
                            )
                          );
                        }}
                        onBlur={(event) =>
                          updateCoupon(coupon.id, {
                            expiresAt: event.target.value
                              ? new Date(event.target.value).getTime()
                              : null,
                          })
                        }
                        style={{ marginTop: 6 }}
                      />
                    </td>
                    <td data-label={t("admin.coupons.019")}>
                      <input
                        className="admin-input"
                        value={coupon.description || ""}
                        onChange={(event) =>
                          setCoupons((prev) =>
                            prev.map((item) =>
                              item.id === coupon.id
                                ? { ...item, description: event.target.value }
                                : item
                            )
                          )
                        }
                        onBlur={(event) =>
                          updateCoupon(coupon.id, { description: event.target.value })
                        }
                      />
                    </td>
                    <td data-label={t("admin.coupons.020")}>
                      <span className="admin-badge neutral">
                        {saving[coupon.id] ? t("ui.coupons.525") : t("admin.coupons.021")}
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
    </div>
  );
}
