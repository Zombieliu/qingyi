"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PlusCircle, RefreshCw, Search } from "lucide-react";
import type { AdminCoupon, CouponStatus } from "@/lib/admin-types";
import { COUPON_STATUS_OPTIONS } from "@/lib/admin-types";
import { readCache, writeCache } from "@/app/components/client-cache";

function toDateInput(ts?: number | null) {
  if (!ts) return "";
  return new Date(ts).toISOString().slice(0, 10);
}

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<AdminCoupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("全部");
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
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

  const load = useCallback(async (nextPage: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(nextPage));
      params.set("pageSize", String(pageSize));
      if (statusFilter && statusFilter !== "全部") params.set("status", statusFilter);
      if (query.trim()) params.set("q", query.trim());
      const cacheKey = `cache:admin:coupons:${params.toString()}`;
      const cached = readCache<{ items: AdminCoupon[]; page?: number; totalPages?: number }>(cacheKey, cacheTtlMs, true);
      if (cached) {
        setCoupons(Array.isArray(cached.value?.items) ? cached.value.items : []);
        setPage(cached.value?.page || nextPage);
        setTotalPages(cached.value?.totalPages || 1);
      }
      const res = await fetch(`/api/admin/coupons?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const next = Array.isArray(data?.items) ? data.items : [];
        setCoupons(next);
        setPage(data?.page || nextPage);
        setTotalPages(data?.totalPages || 1);
        writeCache(cacheKey, { items: next, page: data?.page || nextPage, totalPages: data?.totalPages || 1 });
      }
    } finally {
      setLoading(false);
    }
  }, [cacheTtlMs, pageSize, query, statusFilter]);

  useEffect(() => {
    const handle = setTimeout(() => load(1), 300);
    return () => clearTimeout(handle);
  }, [load]);

  useEffect(() => {
    load(page);
  }, [load, page]);

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
        params.set("page", String(page));
        params.set("pageSize", String(pageSize));
        if (statusFilter && statusFilter !== "全部") params.set("status", statusFilter);
        if (query.trim()) params.set("q", query.trim());
        writeCache(`cache:admin:coupons:${params.toString()}`, { items: next, page, totalPages });
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
          params.set("page", String(page));
          params.set("pageSize", String(pageSize));
          if (statusFilter && statusFilter !== "全部") params.set("status", statusFilter);
          if (query.trim()) params.set("q", query.trim());
          writeCache(`cache:admin:coupons:${params.toString()}`, { items: next, page, totalPages });
          return next;
        });
      }
    } finally {
      setSaving((prev) => ({ ...prev, [couponId]: false }));
    }
  };

  const totalActive = useMemo(
    () => coupons.filter((c) => c.status === "可用").length,
    [coupons]
  );

  return (
    <div className="admin-section">
      <div className="admin-card">
        <div className="admin-card-header">
          <div>
            <h3>新增优惠券</h3>
            <p>配置面向用户的优惠券规则。</p>
          </div>
        </div>
        <div className="admin-form" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <label className="admin-field">
            标题
            <input
              className="admin-input"
              placeholder="节日专享券"
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            />
          </label>
          <label className="admin-field">
            兑换码
            <input
              className="admin-input"
              placeholder="可选"
              value={form.code}
              onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))}
            />
          </label>
          <label className="admin-field">
            立减金额
            <input
              className="admin-input"
              placeholder="例如 20"
              value={form.discount}
              onChange={(event) => setForm((prev) => ({ ...prev, discount: event.target.value }))}
            />
          </label>
          <label className="admin-field">
            最低消费
            <input
              className="admin-input"
              placeholder="例如 199"
              value={form.minSpend}
              onChange={(event) => setForm((prev) => ({ ...prev, minSpend: event.target.value }))}
            />
          </label>
          <label className="admin-field">
            状态
            <select
              className="admin-select"
              value={form.status}
              onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as CouponStatus }))}
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
              placeholder="使用说明"
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
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
            <h3>优惠券筛选</h3>
            <p>按标题、兑换码与状态快速定位。</p>
          </div>
          <div className="admin-card-actions">
            <span className="admin-pill">可用 {totalActive} 张</span>
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
              placeholder="搜索标题 / 兑换码"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <select className="admin-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="全部">全部状态</option>
            {COUPON_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <button className="admin-btn ghost" onClick={() => load(1)}>
            <RefreshCw size={16} style={{ marginRight: 6 }} />
            刷新
          </button>
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h3>优惠券列表</h3>
          <div className="admin-card-actions">
            <span className="admin-pill">共 {coupons.length} 条</span>
          </div>
        </div>
        {loading ? (
          <p>加载优惠券中...</p>
        ) : coupons.length === 0 ? (
          <p className="admin-empty">暂无优惠券</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>标题</th>
                  <th>金额</th>
                  <th>最低消费</th>
                  <th>状态</th>
                  <th>有效期</th>
                  <th>说明</th>
                  <th>更新</th>
                </tr>
              </thead>
              <tbody>
                {coupons.map((coupon) => (
                  <tr key={coupon.id}>
                    <td data-label="标题">
                      <div className="admin-text-strong">{coupon.title}</div>
                      <div className="admin-meta">{coupon.code || "-"}</div>
                    </td>
                    <td data-label="金额">
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
                    <td data-label="最低消费">
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
                    <td data-label="状态">
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
                    <td data-label="有效期">
                      <input
                        className="admin-input"
                        type="date"
                        value={toDateInput(coupon.startsAt)}
                        onChange={(event) => {
                          const value = event.target.value;
                          setCoupons((prev) =>
                            prev.map((item) =>
                              item.id === coupon.id
                                ? { ...item, startsAt: value ? new Date(value).getTime() : undefined }
                                : item
                            )
                          );
                        }}
                        onBlur={(event) =>
                          updateCoupon(coupon.id, {
                            startsAt: event.target.value ? new Date(event.target.value).getTime() : null,
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
                                ? { ...item, expiresAt: value ? new Date(value).getTime() : undefined }
                                : item
                            )
                          );
                        }}
                        onBlur={(event) =>
                          updateCoupon(coupon.id, {
                            expiresAt: event.target.value ? new Date(event.target.value).getTime() : null,
                          })
                        }
                        style={{ marginTop: 6 }}
                      />
                    </td>
                    <td data-label="说明">
                      <input
                        className="admin-input"
                        value={coupon.description || ""}
                        onChange={(event) =>
                          setCoupons((prev) =>
                            prev.map((item) =>
                              item.id === coupon.id ? { ...item, description: event.target.value } : item
                            )
                          )
                        }
                        onBlur={(event) => updateCoupon(coupon.id, { description: event.target.value })}
                      />
                    </td>
                    <td data-label="更新">
                      <span className="admin-badge neutral">
                        {saving[coupon.id] ? "保存中" : "已同步"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="admin-pagination">
          <button
            className="admin-btn ghost"
            disabled={page <= 1}
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          >
            上一页
          </button>
          <div className="admin-meta">
            第 {page} / {totalPages} 页
          </div>
          <button
            className="admin-btn ghost"
            disabled={page >= totalPages}
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}
