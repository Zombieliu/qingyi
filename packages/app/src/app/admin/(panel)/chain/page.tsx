"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { readCache, writeCache } from "@/app/components/client-cache";
import * as chainOrderUtils from "@/lib/chain/chain-order-utils";
import { StateBlock } from "@/app/components/state-block";
import { ConfirmDialog } from "@/app/components/confirm-dialog";

type ChainOrder = {
  orderId: string;
  user: string;
  companion: string;
  serviceFee: string;
  deposit: string;
  status: number;
  createdAt: string;
  disputeDeadline: string;
  localStatus?: number | null;
  effectiveStatus?: number | null;
};

export default function ChainPage() {
  const [chainOrders, setChainOrders] = useState<ChainOrder[]>([]);
  const [missingLocal, setMissingLocal] = useState<ChainOrder[]>([]);
  const [missingChain, setMissingChain] = useState<Array<{ id: string; user: string; item: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [action, setAction] = useState<string | null>(null);
  const [cancelingOrderId, setCancelingOrderId] = useState<string | null>(null);
  const [autoCancelHours, setAutoCancelHours] = useState<number | null>(null);
  const [autoCanceling, setAutoCanceling] = useState(false);
  const [autoCancelResult, setAutoCancelResult] = useState<string | null>(null);
  const [cleanupMissing, setCleanupMissing] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<string | null>(null);
  const [bps, setBps] = useState<Record<string, { service: string; deposit: string }>>({});
  const [manualOrderId, setManualOrderId] = useState("");
  const [manualDigest, setManualDigest] = useState("");
  const [manualSyncing, setManualSyncing] = useState(false);
  const [manualSyncResult, setManualSyncResult] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    description?: string;
    confirmLabel?: string;
    action: () => Promise<void>;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const cacheTtlMs = 60_000;

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const cacheKey = "cache:admin:reconcile";
      const cached = readCache<{
        chainOrders: ChainOrder[];
        missingLocal: ChainOrder[];
        missingChain: Array<{ id: string; user: string; item: string }>;
      }>(cacheKey, cacheTtlMs, true);
      if (cached) {
        setChainOrders(Array.isArray(cached.value?.chainOrders) ? cached.value.chainOrders : []);
        setMissingLocal(Array.isArray(cached.value?.missingLocal) ? cached.value.missingLocal : []);
        setMissingChain(Array.isArray(cached.value?.missingChain) ? cached.value.missingChain : []);
      }
      const res = await fetch("/api/admin/chain/orders");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || "加载失败");
        return;
      }
      const data = await res.json();
      const nextChain = Array.isArray(data?.chainOrders) ? data.chainOrders : [];
      const nextMissingLocal = Array.isArray(data?.missingLocal) ? data.missingLocal : [];
      const nextMissingChain = Array.isArray(data?.missingChain) ? data.missingChain : [];
      const nextAutoCancelHours =
        typeof data?.autoCancel?.hours === "number" ? data.autoCancel.hours : null;
      setChainOrders(nextChain);
      setMissingLocal(nextMissingLocal);
      setMissingChain(nextMissingChain);
      setAutoCancelHours(nextAutoCancelHours);
      writeCache(cacheKey, {
        chainOrders: nextChain,
        missingLocal: nextMissingLocal,
        missingChain: nextMissingChain,
      });
    } catch {
      setError("网络错误，请稍后再试");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const statusLabel = (status: number) => {
    switch (status) {
      case 0:
        return "已创建";
      case 1:
        return "已支付撮合费";
      case 2:
        return "押金已锁定";
      case 3:
        return "已完成待结算";
      case 4:
        return "争议中";
      case 5:
        return "已结算";
      case 6:
        return "已取消";
      default:
        return `未知(${status})`;
    }
  };

  const statusBadgeClass = (status: number) => {
    if (status === 4) return "admin-badge warm";
    if (status === 6) return "admin-badge neutral";
    return "admin-badge";
  };

  const formatAmount = (value: string) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return value;
    return (num / 100).toFixed(2);
  };

  const resolveStatus = useCallback((order: ChainOrder) => {
    if (typeof order.effectiveStatus === "number") return order.effectiveStatus;
    if (typeof order.localStatus === "number") return Math.max(order.localStatus, order.status);
    return order.status;
  }, []);

  const disputedOrders = useMemo(
    () => chainOrders.filter((order) => resolveStatus(order) === 4),
    [chainOrders, resolveStatus]
  );

  const resolveDispute = async (orderId: string) => {
    const config = bps[orderId] || { service: "0", deposit: "0" };
    setAction(orderId);
    try {
      const res = await fetch("/api/admin/chain/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          serviceRefundBps: Number(config.service || 0),
          depositSlashBps: Number(config.deposit || 0),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "裁决失败");
      } else {
        await loadData();
      }
    } finally {
      setAction(null);
    }
  };

  const openConfirm = (payload: {
    title: string;
    description?: string;
    confirmLabel?: string;
    action: () => Promise<void>;
  }) => {
    setConfirmAction(payload);
  };

  const runConfirmAction = async () => {
    if (!confirmAction) return;
    setConfirmBusy(true);
    try {
      await confirmAction.action();
    } finally {
      setConfirmBusy(false);
      setConfirmAction(null);
    }
  };

  const forceCancel = async (orderId: string) => {
    openConfirm({
      title: "确认强制取消该订单？",
      description: "仅限未锁押金的链上订单。",
      confirmLabel: "确认取消",
      action: async () => {
        setCancelingOrderId(orderId);
        try {
          const res = await fetch("/api/admin/chain/cancel", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            setError(data?.error || "取消失败");
          } else {
            await loadData();
          }
        } finally {
          setCancelingOrderId(null);
        }
      },
    });
  };

  const runAutoCancel = async () => {
    openConfirm({
      title: "确认执行超期自动取消？",
      description: "仅会处理未锁押金订单。",
      confirmLabel: "确认执行",
      action: async () => {
        setAutoCanceling(true);
        setAutoCancelResult(null);
        try {
          const res = await fetch("/api/admin/chain/auto-cancel", { method: "POST" });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            setError(data?.error || "执行失败");
            return;
          }
          if (!data?.enabled) {
            setAutoCancelResult("自动取消未启用");
          } else {
            setAutoCancelResult(
              `已取消 ${data?.canceled ?? 0} / ${data?.candidates ?? 0}，失败 ${data?.failures?.length ?? 0}`
            );
          }
          await loadData();
        } finally {
          setAutoCanceling(false);
        }
      },
    });
  };

  const runManualSync = async () => {
    const orderId = manualOrderId.trim();
    const digest = manualDigest.trim();
    if (!orderId || !digest) {
      setManualSyncResult("请填写订单号和交易 digest");
      return;
    }
    setManualSyncing(true);
    setManualSyncResult(null);
    try {
      const res = await fetch(
        `/api/orders/${orderId}/chain-sync?force=1&maxWaitMs=15000&digest=${encodeURIComponent(digest)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setManualSyncResult(data?.message || data?.error || "补单失败");
        return;
      }
      setManualSyncResult(`已补单：订单 #${data?.order?.id || orderId}`);
      setManualOrderId("");
      setManualDigest("");
      await loadData();
    } finally {
      setManualSyncing(false);
    }
  };

  const cleanupMissingChain = async () => {
    if (missingChain.length === 0) return;
    openConfirm({
      title: "确认删除本地缺链订单？",
      description: `共 ${missingChain.length} 条，仅影响数据库，不会动链上。`,
      confirmLabel: "确认清理",
      action: async () => {
        setCleanupMissing(true);
        setCleanupResult(null);
        try {
          const res = await fetch("/api/admin/chain/cleanup-missing", { method: "POST" });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            setError(data?.error || "清理失败");
            return;
          }
          setCleanupResult(`已清理 ${data?.deleted ?? 0} / ${data?.candidates ?? 0} 条`);
          await loadData();
        } finally {
          setCleanupMissing(false);
        }
      },
    });
  };

  const autoCancelMs = useMemo(() => {
    if (!autoCancelHours || autoCancelHours <= 0) return null;
    return autoCancelHours * 60 * 60 * 1000;
  }, [autoCancelHours]);
  const autoCancelDisabled = autoCancelHours === null || autoCancelHours <= 0;

  return (
    <div className="admin-section">
      <div className="admin-card">
        <div className="admin-card-header">
          <div>
            <h3>订单对账</h3>
            <p>
              对比订单记录与对账数据，处理争议裁决。
              {autoCancelHours ? ` 超期自动取消：${autoCancelHours} 小时。` : ""}
            </p>
          </div>
          <div className="admin-card-actions">
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input
                className="admin-input"
                style={{ width: 140 }}
                placeholder="订单号"
                value={manualOrderId}
                onChange={(event) => setManualOrderId(event.target.value)}
              />
              <input
                className="admin-input"
                style={{ width: 220 }}
                placeholder="交易 digest"
                value={manualDigest}
                onChange={(event) => setManualDigest(event.target.value)}
              />
              <button className="admin-btn ghost" onClick={runManualSync} disabled={manualSyncing}>
                {manualSyncing ? "补单中..." : "按 digest 补单"}
              </button>
            </div>
            <button
              className="admin-btn ghost"
              onClick={runAutoCancel}
              disabled={autoCanceling || autoCancelDisabled}
            >
              {autoCanceling ? "处理中..." : "执行超期取消"}
            </button>
            <button className="admin-btn ghost" onClick={loadData} disabled={loading}>
              <RefreshCw size={16} style={{ marginRight: 6 }} />
              刷新
            </button>
          </div>
        </div>
        {manualSyncResult ? (
          <div className="admin-badge" style={{ marginTop: 12 }}>
            {manualSyncResult}
          </div>
        ) : null}
        {autoCancelResult ? (
          <div className="admin-badge" style={{ marginTop: 12 }}>
            {autoCancelResult}
          </div>
        ) : null}
        {error ? (
          <div className="admin-badge warm" style={{ marginTop: 12 }}>
            {error}
          </div>
        ) : null}
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h3>争议订单</h3>
          <div className="admin-card-actions">
            <span className="admin-pill">共 {disputedOrders.length} 条</span>
          </div>
        </div>
        {loading ? (
          <StateBlock tone="loading" size="compact" title="加载中" description="正在同步争议订单" />
        ) : disputedOrders.length === 0 ? (
          <StateBlock tone="empty" size="compact" title="暂无争议订单" description="目前没有待处理争议" />
        ) : (
          <div className="admin-stack">
            {disputedOrders.map((order) => (
              <div key={order.orderId} className="admin-card admin-card--subtle">
                <div className="admin-card-header" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div>
                    <div className="admin-text-strong">订单 #{order.orderId}</div>
                    <div className="admin-meta">
                      用户 {order.user.slice(0, 6)}...{order.user.slice(-4)} · 陪玩{" "}
                      {order.companion.slice(0, 6)}...{order.companion.slice(-4)}
                    </div>
                    <div className="admin-meta" style={{ marginTop: 6 }}>
                      撮合费 ¥{formatAmount(order.serviceFee)} · 押金 ¥{formatAmount(order.deposit)}
                    </div>
                  </div>
                  <div className="admin-card-actions" style={{ flexDirection: "column", alignItems: "stretch" }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        className="admin-input"
                        style={{ width: 90 }}
                        placeholder="服务退款 BPS"
                        value={bps[order.orderId]?.service || ""}
                        onChange={(event) =>
                          setBps((prev) => ({
                            ...prev,
                            [order.orderId]: { ...prev[order.orderId], service: event.target.value },
                          }))
                        }
                      />
                      <input
                        className="admin-input"
                        style={{ width: 90 }}
                        placeholder="押金扣罚 BPS"
                        value={bps[order.orderId]?.deposit || ""}
                        onChange={(event) =>
                          setBps((prev) => ({
                            ...prev,
                            [order.orderId]: { ...prev[order.orderId], deposit: event.target.value },
                          }))
                        }
                      />
                    </div>
                    <button
                      className="admin-btn primary"
                      style={{ marginTop: 8 }}
                      disabled={action === order.orderId}
                      onClick={() => resolveDispute(order.orderId)}
                    >
                      {action === order.orderId ? "裁决中..." : "提交裁决"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h3>订单列表</h3>
          <div className="admin-card-actions">
            <span className="admin-pill">共 {chainOrders.length} 条</span>
          </div>
        </div>
        {loading ? (
          <StateBlock tone="loading" size="compact" title="加载中" description="正在同步链上订单" />
        ) : chainOrders.length === 0 ? (
          <StateBlock tone="empty" size="compact" title="暂无订单" description="暂无链上订单记录" />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>订单号</th>
                  <th>状态</th>
                  <th>撮合费</th>
                  <th>押金</th>
                  <th>创建时间</th>
                  <th>争议截止</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {chainOrders.map((order) => {
                  const createdAt = Number(order.createdAt);
                  const effectiveStatus = resolveStatus(order);
                  const canCancel = chainOrderUtils.isChainOrderCancelable(effectiveStatus);
                  const isExpired =
                    autoCancelMs !== null &&
                    chainOrderUtils.isChainOrderAutoCancelable({ ...order, status: effectiveStatus }, Date.now(), autoCancelMs);
                  return (
                    <tr key={order.orderId}>
                      <td data-label="订单号">{order.orderId}</td>
                      <td data-label="状态">
                        <span className={statusBadgeClass(effectiveStatus)}>
                          {statusLabel(effectiveStatus)}
                        </span>
                        {typeof order.localStatus === "number" && order.localStatus > order.status ? (
                          <span className="admin-badge warm" style={{ marginLeft: 8 }}>
                            本地较新
                          </span>
                        ) : null}
                        {isExpired ? (
                          <span className="admin-badge warm" style={{ marginLeft: 8 }}>
                            超期
                          </span>
                        ) : null}
                      </td>
                      <td data-label="撮合费">¥{formatAmount(order.serviceFee)}</td>
                      <td data-label="押金">¥{formatAmount(order.deposit)}</td>
                      <td data-label="创建时间">
                        {Number.isFinite(createdAt) && createdAt > 0 ? new Date(createdAt).toLocaleString() : "-"}
                      </td>
                      <td data-label="争议截止">
                        {Number(order.disputeDeadline) > 0
                          ? new Date(Number(order.disputeDeadline)).toLocaleString()
                          : "-"}
                      </td>
                      <td data-label="操作">
                        {canCancel ? (
                          <button
                            className="admin-btn ghost"
                            onClick={() => forceCancel(order.orderId)}
                            disabled={cancelingOrderId === order.orderId}
                          >
                            {cancelingOrderId === order.orderId ? "取消中..." : "强制取消"}
                          </button>
                        ) : (
                          <span className="admin-text-muted">需争议/结算</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h3>对账差异</h3>
          <div className="admin-card-actions">
            <button
              className="admin-btn ghost"
              onClick={cleanupMissingChain}
              disabled={cleanupMissing || missingChain.length === 0}
            >
              {cleanupMissing ? "清理中..." : "清理缺链订单"}
            </button>
          </div>
        </div>
        {cleanupResult ? (
          <div className="admin-badge" style={{ marginTop: 12 }}>
            {cleanupResult}
          </div>
        ) : null}
        {loading ? (
          <StateBlock tone="loading" size="compact" title="加载中" description="正在对账链上/本地订单" />
        ) : (
          <div className="admin-stack">
            <div>
              <strong>对账侧存在但本地缺失：</strong>
              {missingLocal.length === 0 ? (
                <span> 无</span>
              ) : (
                <span> {missingLocal.length} 条</span>
              )}
            </div>
            <div>
              <strong>本地存在但对账侧缺失：</strong>
              {missingChain.length === 0 ? (
                <span> 无</span>
              ) : (
                <span> {missingChain.length} 条</span>
              )}
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction?.title ?? ""}
        description={confirmAction?.description}
        confirmLabel={confirmAction?.confirmLabel}
        busy={confirmBusy}
        onConfirm={runConfirmAction}
        onClose={() => setConfirmAction(null)}
      />
    </div>
  );
}
