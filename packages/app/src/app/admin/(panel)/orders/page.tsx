"use client";
import { t } from "@/lib/i18n/t";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Loader2, RefreshCw, Search } from "lucide-react";
import type { AdminOrder, AdminPlayer } from "@/lib/admin/admin-types";
import { ORDER_STAGE_OPTIONS } from "@/lib/admin/admin-types";
import { readCache, writeCache } from "@/lib/shared/client-cache";
import { StateBlock } from "@/app/components/state-block";
import { OrderRow } from "./order-row";
import { roleRank, useAdminSession } from "../admin-session";

export default function OrdersPage() {
  const { role } = useAdminSession();
  const canEdit = roleRank(role) >= roleRank("ops");
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [cacheHint, setCacheHint] = useState<string | null>(null);
  const [players, setPlayers] = useState<AdminPlayer[]>([]);
  const [playersLoading, setPlayersLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState(t("admin.orders.001"));
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [cursor, setCursor] = useState<string | null>(null);
  const [prevCursors, setPrevCursors] = useState<Array<string | null>>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cleaningE2e, setCleaningE2e] = useState(false);
  const [cleanResult, setCleanResult] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [manualForm, setManualForm] = useState({
    user: "",
    item: "",
    amount: "",
    assignedTo: "",
    note: "",
  });
  const pageSize = 20;
  const cacheTtlMs = 60_000;

  const loadOrders = useCallback(
    async (cursorValue: string | null, nextPage: number) => {
      setLoading(true);
      try {
        setCacheHint(null);
        const params = new URLSearchParams();
        params.set("pageSize", String(pageSize));
        if (cursorValue) params.set("cursor", cursorValue);
        if (stageFilter && stageFilter !== t("admin.panel.orders.i067"))
          params.set("stage", stageFilter);
        if (query.trim()) params.set("q", query.trim());
        const cacheKey = `cache:admin:orders:${params.toString()}`;
        const cached = readCache<{ items: AdminOrder[]; nextCursor?: string | null }>(
          cacheKey,
          cacheTtlMs,
          true
        );
        if (cached) {
          setOrders(Array.isArray(cached.value?.items) ? cached.value.items : []);
          setPage(nextPage);
          setNextCursor(cached.value?.nextCursor || null);
          setCacheHint(cached.fresh ? null : t("admin.orders.002"));
        }
        const res = await fetch(`/api/admin/orders?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setOrders(Array.isArray(data?.items) ? data.items : []);
          setPage(nextPage);
          setNextCursor(data?.nextCursor || null);
          setCacheHint(null);
          setSelectedIds([]);
          writeCache(cacheKey, {
            items: Array.isArray(data?.items) ? data.items : [],
            nextCursor: data?.nextCursor || null,
          });
        }
      } finally {
        setLoading(false);
      }
    },
    [cacheTtlMs, pageSize, query, stageFilter]
  );

  const loadPlayers = useCallback(async () => {
    setPlayersLoading(true);
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
      setPlayersLoading(false);
    }
  }, [cacheTtlMs]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setPrevCursors([]);
      setCursor(null);
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [query, stageFilter]);

  useEffect(() => {
    loadOrders(cursor, page);
  }, [loadOrders, cursor, page]);

  useEffect(() => {
    loadPlayers();
  }, [loadPlayers]);

  const updateOrder = async (orderId: string, patch: Partial<AdminOrder>) => {
    if (!canEdit) return;
    setSaving((prev) => ({ ...prev, [orderId]: true }));
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const data = await res.json();
        setOrders((prev) => {
          const next = prev.map((order) => (order.id === orderId ? data : order));
          const params = new URLSearchParams();
          params.set("pageSize", String(pageSize));
          if (cursor) params.set("cursor", cursor);
          if (stageFilter && stageFilter !== t("admin.panel.orders.i068"))
            params.set("stage", stageFilter);
          if (query.trim()) params.set("q", query.trim());
          writeCache(`cache:admin:orders:${params.toString()}`, {
            items: next,
            nextCursor,
          });
          return next;
        });
        if (patch.assignedTo !== undefined || patch.stage !== undefined) {
          await loadPlayers();
        }
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data?.error || t("admin.panel.orders.i069"));
      }
    } finally {
      setSaving((prev) => ({ ...prev, [orderId]: false }));
    }
  };

  const toggleSelect = (id: string) => {
    if (!canEdit) return;
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = (checked: boolean) => {
    if (!canEdit) return;
    setSelectedIds(checked ? orders.map((item) => item.id) : []);
  };

  const bulkDelete = async () => {
    if (!canEdit) return;
    if (selectedIds.length === 0) return;
    if (!confirm(`确定要删除选中的 ${selectedIds.length} 条订单吗？`)) return;
    setBulkDeleting(true);
    try {
      const res = await fetch("/api/admin/orders/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
      });
      if (res.ok) {
        setSelectedIds([]);
        await loadOrders(cursor, page);
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data?.error || t("admin.panel.orders.i070"));
      }
    } finally {
      setBulkDeleting(false);
    }
  };

  const createManualOrder = async () => {
    if (!canEdit) return;
    if (!manualForm.user.trim() || !manualForm.item.trim() || !manualForm.amount.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user: manualForm.user.trim(),
          item: manualForm.item.trim(),
          amount: Number(manualForm.amount),
          currency: "CNY",
          stage: "待处理",
          assignedTo: manualForm.assignedTo || undefined,
          note: manualForm.note.trim() || undefined,
          source: "manual",
        }),
      });
      if (res.ok) {
        setManualForm({ user: "", item: "", amount: "", assignedTo: "", note: "" });
        setManualOpen(false);
        setPrevCursors([]);
        setCursor(null);
        setPage(1);
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data?.error || "创建订单失败");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const cleanupE2e = async () => {
    if (!canEdit) return;
    if (!confirm(t("admin.orders.003"))) return;
    setCleaningE2e(true);
    setCleanResult(null);
    try {
      const res = await fetch("/api/admin/orders/cleanup-e2e", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data?.error || t("admin.panel.orders.i071"));
        return;
      }
      setCleanResult(`已清理 ${data?.deleted ?? 0} / ${data?.candidates ?? 0} 条`);
      setPrevCursors([]);
      setCursor(null);
      setPage(1);
    } finally {
      setCleaningE2e(false);
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

  return (
    <div className="admin-section">
      {canEdit && (
        <div className="admin-card">
          <div
            className="admin-card-header"
            style={{ cursor: "pointer" }}
            onClick={() => setManualOpen((v) => !v)}
          >
            <div>
              <h3>人工下单</h3>
              <p>手动为用户创建订单</p>
            </div>
            <ChevronDown
              size={18}
              style={{
                transition: "transform .2s",
                transform: manualOpen ? "rotate(180deg)" : undefined,
              }}
            />
          </div>
          {manualOpen && (
            <>
              <div className="admin-form">
                <label className="admin-field">
                  用户名
                  <input
                    className="admin-input"
                    placeholder="输入用户名"
                    value={manualForm.user}
                    onChange={(e) => setManualForm((p) => ({ ...p, user: e.target.value }))}
                  />
                </label>
                <label className="admin-field">
                  套餐/项目
                  <input
                    className="admin-input"
                    placeholder="如：王者荣耀陪玩 3局"
                    value={manualForm.item}
                    onChange={(e) => setManualForm((p) => ({ ...p, item: e.target.value }))}
                  />
                </label>
                <label className="admin-field">
                  金额 (CNY)
                  <input
                    className="admin-input"
                    placeholder="0"
                    value={manualForm.amount}
                    onChange={(e) => setManualForm((p) => ({ ...p, amount: e.target.value }))}
                  />
                </label>
                <label className="admin-field">
                  分配陪练
                  <select
                    className="admin-select"
                    value={manualForm.assignedTo}
                    onChange={(e) => setManualForm((p) => ({ ...p, assignedTo: e.target.value }))}
                  >
                    <option value="">不分配</option>
                    {players.map((player) => (
                      <option key={player.id} value={player.name}>
                        {player.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="admin-field" style={{ gridColumn: "1 / -1" }}>
                  备注
                  <input
                    className="admin-input"
                    placeholder="可选备注"
                    value={manualForm.note}
                    onChange={(e) => setManualForm((p) => ({ ...p, note: e.target.value }))}
                  />
                </label>
              </div>
              <div className="admin-card-actions" style={{ marginTop: 14 }}>
                <button
                  className="admin-btn primary"
                  onClick={createManualOrder}
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <Loader2 size={14} className="spin" /> 创建中...
                    </>
                  ) : (
                    "创建订单"
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      )}
      <div className="admin-card">
        <div className="admin-card-header">
          <div>
            <h3>{t("ui.orders.406")}</h3>
            <p>{t("ui.orders.407")}</p>
          </div>
        </div>
        <div className="admin-toolbar">
          <div className="admin-toolbar-grow" style={{ position: "relative" }}>
            <Search size={16} className="admin-input-icon" />
            <input
              className="admin-input"
              style={{ paddingLeft: 36 }}
              placeholder={t("admin.orders.004")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <select
            className="admin-select"
            value={stageFilter}
            onChange={(event) => setStageFilter(event.target.value)}
          >
            <option value={t("admin.orders.005")}>{t("ui.orders.408")}</option>
            {ORDER_STAGE_OPTIONS.map((stage) => (
              <option key={stage} value={stage}>
                {stage}
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
          {canEdit ? (
            <button
              className="admin-btn ghost"
              disabled={selectedIds.length === 0 || bulkDeleting}
              onClick={bulkDelete}
            >
              {bulkDeleting ? (
                <>
                  <Loader2 size={14} className="spin" /> 删除中...
                </>
              ) : (
                <>删除选中{selectedIds.length > 0 ? `（${selectedIds.length}）` : ""}</>
              )}
            </button>
          ) : null}
          {canEdit ? (
            <button className="admin-btn ghost" disabled={cleaningE2e} onClick={cleanupE2e}>
              {cleaningE2e ? t("admin.panel.orders.i072") : t("admin.orders.006")}
            </button>
          ) : null}
          {canEdit ? (
            <a
              className="admin-btn ghost"
              href={`/api/admin/orders/export?format=csv&stage=${encodeURIComponent(stageFilter)}&q=${encodeURIComponent(
                query.trim()
              )}`}
            >
              导出 CSV
            </a>
          ) : (
            <span className="admin-badge neutral">{t("ui.orders.409")}</span>
          )}
        </div>
        {cleanResult ? (
          <div className="admin-badge" style={{ marginTop: 12 }}>
            {cleanResult}
          </div>
        ) : null}
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h3>{t("ui.orders.410")}</h3>
          <div className="admin-card-actions">
            <span className="admin-pill">本页 {orders.length} 条</span>
            {selectedIds.length > 0 ? (
              <span className="admin-pill">已选 {selectedIds.length} 条</span>
            ) : null}
            {cacheHint ? <span className="admin-pill">{cacheHint}</span> : null}
          </div>
        </div>
        {loading ? (
          <StateBlock
            tone="loading"
            size="compact"
            title={t("admin.orders.007")}
            description={t("admin.orders.008")}
          />
        ) : orders.length === 0 ? (
          <StateBlock
            tone="empty"
            size="compact"
            title={t("admin.orders.009")}
            description={t("admin.orders.010")}
          />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>
                    <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={orders.length > 0 && selectedIds.length === orders.length}
                        onChange={(event) => toggleSelectAll(event.target.checked)}
                        disabled={orders.length === 0 || !canEdit}
                      />
                      选择
                    </label>
                  </th>
                  <th>{t("ui.orders.411")}</th>
                  <th>{t("ui.orders.412")}</th>
                  <th>{t("ui.orders.413")}</th>
                  <th>{t("ui.orders.414")}</th>
                  <th>{t("ui.orders.415")}</th>
                  <th>{t("ui.orders.416")}</th>
                  <th>{t("ui.orders.417")}</th>
                  <th>{t("ui.orders.418")}</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <OrderRow
                    key={order.id}
                    order={order}
                    canEdit={canEdit}
                    saving={Boolean(saving[order.id])}
                    selected={selectedIds.includes(order.id)}
                    players={players}
                    playersLoading={playersLoading}
                    onToggleSelect={() => toggleSelect(order.id)}
                    onUpdate={updateOrder}
                    onSetField={(id, field, value) =>
                      setOrders((prev) =>
                        prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
                      )
                    }
                  />
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
