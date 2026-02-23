"use client";
import { t } from "@/lib/i18n/t";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { readCache, writeCache } from "@/lib/shared/client-cache";
import { StateBlock } from "@/app/components/state-block";
import { ConfirmDialog } from "@/app/components/confirm-dialog";
import { ChainOrdersTable, DisputedOrdersCard } from "./chain-components";

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
  const [missingChain, setMissingChain] = useState<
    Array<{ id: string; user: string; item: string }>
  >([]);
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
        setError(data?.error || t("admin.panel.chain.i024"));
        return;
      }
      const data = await res.json();
      const nextChain = Array.isArray(data?.chainOrders) ? data.chainOrders : [];
      const nextMissingLocal = Array.isArray(data?.missingLocal) ? data.missingLocal : [];
      const nextMissingChain = Array.isArray(data?.missingChain) ? data.missingChain : [];
      setChainOrders(nextChain);
      setMissingLocal(nextMissingLocal);
      setMissingChain(nextMissingChain);
      setAutoCancelHours(
        typeof data?.autoCancel?.hours === "number" ? data.autoCancel.hours : null
      );
      writeCache(cacheKey, {
        chainOrders: nextChain,
        missingLocal: nextMissingLocal,
        missingChain: nextMissingChain,
      });
    } catch {
      setError(t("admin.chain.001"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const resolveStatus = useCallback((order: ChainOrder) => {
    if (typeof order.effectiveStatus === "number") return order.effectiveStatus;
    if (typeof order.localStatus === "number") return Math.max(order.localStatus, order.status);
    return order.status;
  }, []);

  const disputedOrders = useMemo(
    () => chainOrders.filter((o) => resolveStatus(o) === 4),
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
      if (!res.ok) setError(data?.error || t("admin.panel.chain.i025"));
      else await loadData();
    } finally {
      setAction(null);
    }
  };

  const openConfirm = (payload: {
    title: string;
    description?: string;
    confirmLabel?: string;
    action: () => Promise<void>;
  }) => setConfirmAction(payload);
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

  const forceCancel = (orderId: string) => {
    openConfirm({
      title: t("admin.panel.chain.i150"),
      description: t("admin.panel.chain.i151"),
      confirmLabel: t("admin.panel.chain.i152"),
      action: async () => {
        setCancelingOrderId(orderId);
        try {
          const res = await fetch("/api/admin/chain/cancel", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) setError(data?.error || t("admin.panel.chain.i026"));
          else await loadData();
        } finally {
          setCancelingOrderId(null);
        }
      },
    });
  };

  const runAutoCancel = () => {
    openConfirm({
      title: t("admin.panel.chain.i153"),
      description: t("admin.panel.chain.i154"),
      confirmLabel: t("admin.panel.chain.i155"),
      action: async () => {
        setAutoCanceling(true);
        setAutoCancelResult(null);
        try {
          const res = await fetch("/api/admin/chain/auto-cancel", { method: "POST" });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            setError(data?.error || t("admin.panel.chain.i027"));
            return;
          }
          if (!data?.enabled) {
            setAutoCancelResult("order.auto_cancel_disabled");
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
      setManualSyncResult("form.order_digest_required");
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
        setManualSyncResult(data?.message || data?.error || t("admin.panel.chain.i028"));
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

  const cleanupMissingChain = () => {
    if (missingChain.length === 0) return;
    openConfirm({
      title: t("admin.panel.chain.i156"),
      description: `共 ${missingChain.length} 条，仅影响数据库，不会动链上。`,
      confirmLabel: t("admin.panel.chain.i157"),
      action: async () => {
        setCleanupMissing(true);
        setCleanupResult(null);
        try {
          const res = await fetch("/api/admin/chain/cleanup-missing", { method: "POST" });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            setError(data?.error || t("admin.panel.chain.i029"));
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

  const autoCancelMs = useMemo(
    () => (autoCancelHours && autoCancelHours > 0 ? autoCancelHours * 3600000 : null),
    [autoCancelHours]
  );
  const autoCancelDisabled = autoCancelHours === null || autoCancelHours <= 0;

  return (
    <div className="admin-section">
      <div className="admin-card">
        <div className="admin-card-header">
          <div>
            <h3>{t("ui.chain.319")}</h3>
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
                placeholder={t("admin.chain.009")}
                value={manualOrderId}
                onChange={(e) => setManualOrderId(e.target.value)}
              />
              <input
                className="admin-input"
                style={{ width: 220 }}
                placeholder={t("admin.chain.010")}
                value={manualDigest}
                onChange={(e) => setManualDigest(e.target.value)}
              />
              <button className="admin-btn ghost" onClick={runManualSync} disabled={manualSyncing}>
                {manualSyncing ? t("admin.panel.chain.i030") : t("admin.chain.011")}
              </button>
            </div>
            <button
              className="admin-btn ghost"
              onClick={runAutoCancel}
              disabled={autoCanceling || autoCancelDisabled}
            >
              {autoCanceling ? t("admin.panel.chain.i031") : t("admin.chain.012")}
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

      <DisputedOrdersCard
        disputedOrders={disputedOrders}
        loading={loading}
        action={action}
        bps={bps}
        onBpsChange={(id, field, val) =>
          setBps((prev) => ({ ...prev, [id]: { ...prev[id], [field]: val } }))
        }
        onResolve={resolveDispute}
      />

      <ChainOrdersTable
        chainOrders={chainOrders}
        loading={loading}
        autoCancelMs={autoCancelMs}
        cancelingOrderId={cancelingOrderId}
        now={Date.now()}
        resolveStatus={resolveStatus}
        onForceCancel={forceCancel}
      />

      <div className="admin-card">
        <div className="admin-card-header">
          <h3>{t("ui.chain.330")}</h3>
          <div className="admin-card-actions">
            <button
              className="admin-btn ghost"
              onClick={cleanupMissingChain}
              disabled={cleanupMissing || missingChain.length === 0}
            >
              {cleanupMissing ? t("admin.panel.chain.i033") : t("admin.chain.032")}
            </button>
          </div>
        </div>
        {cleanupResult ? (
          <div className="admin-badge" style={{ marginTop: 12 }}>
            {cleanupResult}
          </div>
        ) : null}
        {loading ? (
          <StateBlock
            tone="loading"
            size="compact"
            title={t("admin.chain.033")}
            description={t("admin.chain.034")}
          />
        ) : (
          <div className="admin-stack">
            <div>
              <strong>{t("ui.chain.331")}</strong>
              {missingLocal.length === 0 ? (
                <span> 无</span>
              ) : (
                <span> {missingLocal.length} 条</span>
              )}
            </div>
            <div>
              <strong>{t("ui.chain.332")}</strong>
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
