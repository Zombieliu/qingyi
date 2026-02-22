"use client";
import { t } from "@/lib/i18n/i18n-client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { readCache, writeCache } from "@/lib/shared/client-cache";
import { StateBlock } from "@/app/components/state-block";

type PaymentEvent = {
  id: string;
  provider: string;
  event: string;
  orderNo?: string;
  amount?: number;
  status?: string;
  verified: boolean;
  createdAt: number;
};

export default function PaymentsPage() {
  const [events, setEvents] = useState<PaymentEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [cacheHint, setCacheHint] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [cursor, setCursor] = useState<string | null>(null);
  const [prevCursors, setPrevCursors] = useState<Array<string | null>>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const pageSize = 30;
  const cacheTtlMs = 60_000;

  const load = useCallback(
    async (cursorValue: string | null, nextPage: number) => {
      setLoading(true);
      try {
        setCacheHint(null);
        const params = new URLSearchParams();
        params.set("pageSize", String(pageSize));
        if (cursorValue) params.set("cursor", cursorValue);
        const cacheKey = `cache:admin:payments:${params.toString()}`;
        const cached = readCache<{ items: PaymentEvent[]; nextCursor?: string | null }>(
          cacheKey,
          cacheTtlMs,
          true
        );
        if (cached) {
          setEvents(Array.isArray(cached.value?.items) ? cached.value.items : []);
          setPage(nextPage);
          setNextCursor(cached.value?.nextCursor || null);
          setCacheHint(cached.fresh ? null : t("admin.payments.001"));
        }
        const res = await fetch(`/api/admin/payments?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          const next = Array.isArray(data?.items) ? data.items : [];
          setEvents(next);
          setPage(nextPage);
          setNextCursor(data?.nextCursor || null);
          setCacheHint(null);
          writeCache(cacheKey, { items: next, nextCursor: data?.nextCursor || null });
        }
      } finally {
        setLoading(false);
      }
    },
    [cacheTtlMs, pageSize]
  );

  useEffect(() => {
    load(cursor, page);
  }, [load, cursor, page]);

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

  return (
    <div className="admin-section">
      <div className="admin-card">
        <div className="admin-card-header">
          <div>
            <h3>{t("ui.payments.194")}</h3>
            <p>{t("ui.payments.195")}</p>
          </div>
          <div className="admin-card-actions">
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
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h3>{t("ui.payments.196")}</h3>
          <div className="admin-card-actions">
            <span className="admin-pill">共 {events.length} 条</span>
            {cacheHint ? <span className="admin-pill">{cacheHint}</span> : null}
          </div>
        </div>
        {loading ? (
          <StateBlock
            tone="loading"
            size="compact"
            title={t("admin.payments.003")}
            description={t("admin.payments.002")}
          />
        ) : events.length === 0 ? (
          <StateBlock
            tone="empty"
            size="compact"
            title={t("admin.payments.004")}
            description={t("admin.payments.005")}
          />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t("ui.payments.197")}</th>
                  <th>{t("ui.payments.198")}</th>
                  <th>{t("ui.payments.199")}</th>
                  <th>{t("ui.payments.200")}</th>
                  <th>{t("ui.payments.201")}</th>
                  <th>{t("ui.payments.202")}</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td data-label={t("admin.payments.006")} className="admin-meta">
                      {new Date(event.createdAt).toLocaleString()}
                    </td>
                    <td data-label={t("admin.payments.007")}>{event.event}</td>
                    <td data-label={t("admin.payments.008")}>{event.orderNo || "-"}</td>
                    <td data-label={t("admin.payments.009")}>
                      {typeof event.amount === "number" ? event.amount : "-"}
                    </td>
                    <td data-label={t("admin.payments.010")}>
                      {event.status ? (
                        <span className="admin-badge neutral">{event.status}</span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td data-label={t("admin.payments.011")}>
                      <span className={`admin-badge${event.verified ? "" : " warm"}`}>
                        {event.verified ? t("ui.payments.584") : t("admin.payments.012")}
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
