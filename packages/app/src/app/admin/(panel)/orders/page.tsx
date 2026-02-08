"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import type { AdminOrder, AdminPlayer, OrderStage } from "@/lib/admin-types";
import { ORDER_STAGE_OPTIONS } from "@/lib/admin-types";
import { readCache, writeCache } from "@/app/components/client-cache";

function formatTime(ts: number) {
  return new Date(ts).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [players, setPlayers] = useState<AdminPlayer[]>([]);
  const [playersLoading, setPlayersLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("全部");
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [cleaningE2e, setCleaningE2e] = useState(false);
  const [cleanResult, setCleanResult] = useState<string | null>(null);
  const pageSize = 20;
  const cacheTtlMs = 60_000;

  const loadOrders = useCallback(async (nextPage: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(nextPage));
      params.set("pageSize", String(pageSize));
      if (stageFilter && stageFilter !== "全部") params.set("stage", stageFilter);
      if (query.trim()) params.set("q", query.trim());
      const cacheKey = `cache:admin:orders:${params.toString()}`;
      const cached = readCache<{ items: AdminOrder[]; page?: number; totalPages?: number }>(cacheKey, cacheTtlMs, true);
      if (cached) {
        setOrders(Array.isArray(cached.value?.items) ? cached.value.items : []);
        setPage(cached.value?.page || nextPage);
        setTotalPages(cached.value?.totalPages || 1);
      }
      const res = await fetch(`/api/admin/orders?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setOrders(Array.isArray(data?.items) ? data.items : []);
        setPage(data?.page || nextPage);
        setTotalPages(data?.totalPages || 1);
        setSelectedIds([]);
        writeCache(cacheKey, {
          items: Array.isArray(data?.items) ? data.items : [],
          page: data?.page || nextPage,
          totalPages: data?.totalPages || 1,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [cacheTtlMs, pageSize, query, stageFilter]);

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

  const playerLookup = useMemo(() => {
    const map = new Map<string, AdminPlayer>();
    players.forEach((player) => {
      map.set(player.id, player);
      map.set(player.name, player);
    });
    return map;
  }, [players]);

  useEffect(() => {
    const handle = setTimeout(() => {
      loadOrders(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [loadOrders]);

  useEffect(() => {
    loadOrders(page);
  }, [loadOrders, page]);

  useEffect(() => {
    loadPlayers();
  }, [loadPlayers]);

  const updateOrder = async (orderId: string, patch: Partial<AdminOrder>) => {
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
          params.set("page", String(page));
          params.set("pageSize", String(pageSize));
          if (stageFilter && stageFilter !== "全部") params.set("stage", stageFilter);
          if (query.trim()) params.set("q", query.trim());
          writeCache(`cache:admin:orders:${params.toString()}`, {
            items: next,
            page,
            totalPages,
          });
          return next;
        });
        if (patch.assignedTo !== undefined || patch.stage !== undefined) {
          await loadPlayers();
        }
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data?.error || "更新失败");
      }
    } finally {
      setSaving((prev) => ({ ...prev, [orderId]: false }));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]));
  };

  const toggleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? orders.map((item) => item.id) : []);
  };

  const bulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`确定要删除选中的 ${selectedIds.length} 条订单吗？`)) return;
    const res = await fetch("/api/admin/orders/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selectedIds }),
    });
    if (res.ok) {
      setSelectedIds([]);
      await loadOrders(page);
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data?.error || "批量删除失败");
    }
  };

  const cleanupE2e = async () => {
    if (!confirm("确认清理所有 E2E 测试订单？")) return;
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
        alert(data?.error || "清理失败");
        return;
      }
      setCleanResult(`已清理 ${data?.deleted ?? 0} / ${data?.candidates ?? 0} 条`);
      await loadOrders(1);
    } finally {
      setCleaningE2e(false);
    }
  };

  return (
    <div className="admin-section">
      <div className="admin-card">
        <div className="admin-card-header">
          <div>
            <h3>订单筛选</h3>
            <p>按用户、订单号、商品与阶段检索。</p>
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
              placeholder="搜索用户 / 订单号 / 商品"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <select className="admin-select" value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}>
            <option value="全部">全部状态</option>
            {ORDER_STAGE_OPTIONS.map((stage) => (
              <option key={stage} value={stage}>
                {stage}
              </option>
            ))}
          </select>
          <button className="admin-btn ghost" onClick={() => loadOrders(1)}>
            <RefreshCw size={16} style={{ marginRight: 6 }} />
            刷新
          </button>
          <button className="admin-btn ghost" disabled={selectedIds.length === 0} onClick={bulkDelete}>
            删除选中{selectedIds.length > 0 ? `（${selectedIds.length}）` : ""}
          </button>
          <button className="admin-btn ghost" disabled={cleaningE2e} onClick={cleanupE2e}>
            {cleaningE2e ? "清理中..." : "清理 E2E"}
          </button>
          <a
            className="admin-btn ghost"
            href={`/api/admin/orders/export?format=csv&stage=${encodeURIComponent(stageFilter)}&q=${encodeURIComponent(
              query.trim()
            )}`}
          >
            导出 CSV
          </a>
        </div>
        {cleanResult ? (
          <div className="admin-badge" style={{ marginTop: 12 }}>
            {cleanResult}
          </div>
        ) : null}
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h3>订单列表</h3>
          <div className="admin-card-actions">
            <span className="admin-pill">本页 {orders.length} 条</span>
            {selectedIds.length > 0 ? (
              <span className="admin-pill">已选 {selectedIds.length} 条</span>
            ) : null}
          </div>
        </div>
        {loading ? (
          <p>加载订单中...</p>
        ) : orders.length === 0 ? (
          <p>没有符合条件的订单</p>
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
                        disabled={orders.length === 0}
                      />
                      选择
                    </label>
                  </th>
                  <th>订单信息</th>
                  <th>金额</th>
                  <th>付款状态</th>
                  <th>流程状态</th>
                  <th>派单</th>
                  <th>备注</th>
                  <th>更新</th>
                  <th>详情</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const assignedKey = (order.assignedTo || "").trim();
                  const matchedPlayer = assignedKey ? playerLookup.get(assignedKey) : undefined;
                  const selectValue = matchedPlayer ? matchedPlayer.id : assignedKey;
                  const available = matchedPlayer?.availableCredit ?? 0;
                  const used = matchedPlayer?.usedCredit ?? 0;
                  const limit = matchedPlayer?.creditLimit ?? 0;
                  const insufficient = matchedPlayer ? order.amount > available : false;
                  const isChainOrder =
                    Boolean(order.chainDigest) || (order.chainStatus !== undefined && order.chainStatus !== null);

                  return (
                    <tr key={order.id}>
                    <td data-label="选择">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(order.id)}
                        onChange={() => toggleSelect(order.id)}
                      />
                    </td>
                    <td data-label="订单信息">
                      <div className="admin-text-strong">{order.user}</div>
                      <div className="admin-meta">{order.item}</div>
                      <div className="admin-meta-faint">{order.id}</div>
                      {isChainOrder ? (
                        <div style={{ marginTop: 6 }}>
                          <span className="admin-badge warm">系统订单</span>
                        </div>
                      ) : null}
                      <div className="admin-meta-faint">{formatTime(order.createdAt)}</div>
                    </td>
                    <td data-label="金额">
                      <div className="admin-text-strong">
                        {order.currency === "CNY" ? "¥" : order.currency} {order.amount}
                      </div>
                    </td>
                    <td data-label="付款状态">
                      {isChainOrder ? (
                        <input
                          className="admin-input"
                          readOnly
                          value={order.paymentStatus || ""}
                          title="订单状态由系统同步"
                        />
                      ) : (
                        <input
                          className="admin-input"
                          value={order.paymentStatus || ""}
                          onChange={(event) =>
                            setOrders((prev) =>
                              prev.map((item) =>
                                item.id === order.id
                                  ? { ...item, paymentStatus: event.target.value }
                                  : item
                              )
                            )
                          }
                          onBlur={(event) =>
                            updateOrder(order.id, { paymentStatus: event.target.value })
                          }
                        />
                      )}
                    </td>
                    <td data-label="流程状态">
                      <select
                        className="admin-select"
                        value={order.stage}
                        aria-label="订单阶段"
                        disabled={isChainOrder}
                        title={isChainOrder ? "订单阶段由系统同步" : ""}
                        onChange={(event) => {
                          if (isChainOrder) return;
                          const nextStage = event.target.value as OrderStage;
                          setOrders((prev) =>
                            prev.map((item) =>
                              item.id === order.id ? { ...item, stage: nextStage } : item
                            )
                          );
                          updateOrder(order.id, { stage: nextStage });
                        }}
                      >
                        {ORDER_STAGE_OPTIONS.map((stage) => (
                          <option key={stage} value={stage}>
                            {stage}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td data-label="派单">
                      <div style={{ display: "grid", gap: 6 }}>
                        <select
                          className="admin-select"
                          value={selectValue}
                          aria-label="打手/客服"
                          onChange={(event) => {
                            const nextValue = event.target.value;
                            const selectedPlayer = players.find((player) => player.id === nextValue);
                            const assignedTo = selectedPlayer ? selectedPlayer.name : nextValue;
                            setOrders((prev) =>
                              prev.map((item) =>
                                item.id === order.id ? { ...item, assignedTo } : item
                              )
                            );
                            updateOrder(order.id, { assignedTo });
                          }}
                        >
                          <option value="">未派单</option>
                          {assignedKey && !matchedPlayer ? (
                            <option value={assignedKey}>当前：{assignedKey}</option>
                          ) : null}
                          {players.map((player) => (
                            <option key={player.id} value={player.id}>
                              {player.name}
                              {player.status !== "可接单" ? `（${player.status}）` : ""}
                            </option>
                          ))}
                        </select>
                        <div
                          className={`admin-meta-faint${insufficient ? " admin-text-danger" : ""}`}
                        >
                          {playersLoading
                            ? "额度加载中..."
                            : matchedPlayer
                              ? `可用 ${available} 元 / 占用 ${used} 元 / 总额度 ${limit} 元`
                              : "未选择打手"}
                          {insufficient ? "（余额不足）" : ""}
                        </div>
                      </div>
                    </td>
                    <td data-label="备注">
                      <input
                        className="admin-input"
                        placeholder="备注"
                        value={order.note || ""}
                        onChange={(event) =>
                          setOrders((prev) =>
                            prev.map((item) =>
                              item.id === order.id
                                ? { ...item, note: event.target.value }
                                : item
                            )
                          )
                        }
                        onBlur={(event) =>
                          updateOrder(order.id, { note: event.target.value })
                        }
                      />
                    </td>
                    <td data-label="更新">
                      <span className="admin-badge neutral">
                        {saving[order.id] ? "保存中" : "已同步"}
                      </span>
                    </td>
                    <td data-label="详情">
                      <Link className="admin-btn ghost" href={`/admin/orders/${order.id}`}>
                        查看
                      </Link>
                    </td>
                  </tr>
                  );
                })}
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
