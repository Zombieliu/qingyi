"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import type { AdminOrder, AdminPlayer, OrderStage } from "@/lib/admin-types";
import { ORDER_STAGE_OPTIONS } from "@/lib/admin-types";

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
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 20;

  const loadOrders = useCallback(async (nextPage: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(nextPage));
      params.set("pageSize", String(pageSize));
      if (stageFilter && stageFilter !== "全部") params.set("stage", stageFilter);
      if (query.trim()) params.set("q", query.trim());
      const res = await fetch(`/api/admin/orders?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setOrders(Array.isArray(data?.items) ? data.items : []);
        setPage(data?.page || nextPage);
        setTotalPages(data?.totalPages || 1);
      }
    } finally {
      setLoading(false);
    }
  }, [pageSize, query, stageFilter]);

  const loadPlayers = useCallback(async () => {
    setPlayersLoading(true);
    try {
      const res = await fetch("/api/admin/players");
      if (res.ok) {
        const data = await res.json();
        setPlayers(Array.isArray(data) ? data : []);
      }
    } finally {
      setPlayersLoading(false);
    }
  }, []);

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
        setOrders((prev) =>
          prev.map((order) => (order.id === orderId ? data : order))
        );
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

  return (
    <div className="admin-section">
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
              placeholder="搜索用户 / 订单号 / 商品"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <select
            className="admin-select"
            style={{ minWidth: 160 }}
            value={stageFilter}
            onChange={(event) => setStageFilter(event.target.value)}
          >
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
          <a
            className="admin-btn ghost"
            href={`/api/admin/orders/export?format=csv&stage=${encodeURIComponent(stageFilter)}&q=${encodeURIComponent(
              query.trim()
            )}`}
          >
            导出 CSV
          </a>
        </div>
      </div>

      <div className="admin-card">
        {loading ? (
          <p>加载订单中...</p>
        ) : orders.length === 0 ? (
          <p>没有符合条件的订单</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="admin-table">
              <thead>
                <tr>
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
                    <td>
                      <div style={{ fontWeight: 600 }}>{order.user}</div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>
                        {order.item}
                      </div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>
                        {order.id}
                      </div>
                      {isChainOrder ? (
                        <div style={{ marginTop: 6 }}>
                          <span className="admin-badge warm">链上订单</span>
                        </div>
                      ) : null}
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>
                        {formatTime(order.createdAt)}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>
                        {order.currency === "CNY" ? "¥" : order.currency} {order.amount}
                      </div>
                    </td>
                    <td>
                      {isChainOrder ? (
                        <input
                          className="admin-input"
                          readOnly
                          value={order.paymentStatus || ""}
                          title="链上订单状态由链上同步"
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
                    <td>
                      <select
                        className="admin-select"
                        value={order.stage}
                        aria-label="订单阶段"
                        disabled={isChainOrder}
                        title={isChainOrder ? "链上订单阶段由链上同步" : ""}
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
                    <td>
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
                          style={{
                            fontSize: 11,
                            color: insufficient ? "#dc2626" : "#94a3b8",
                          }}
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
                    <td>
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
                    <td>
                      <span className="admin-badge neutral">
                        {saving[order.id] ? "保存中" : "已同步"}
                      </span>
                    </td>
                    <td>
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
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, alignItems: "center" }}>
          <button
            className="admin-btn ghost"
            disabled={page <= 1}
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          >
            上一页
          </button>
          <div style={{ fontSize: 12, color: "#64748b" }}>
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
