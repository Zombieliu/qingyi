"use client";

import { useEffect, useState, useCallback } from "react";
import { StateBlock } from "@/app/components/state-block";

type ChainDispute = {
  orderId: string;
  user: string;
  companion: string;
  serviceFee: string;
  deposit: string;
  status: number;
  disputeDeadline: string;
};

type LocalDispute = {
  id: string;
  orderId: string;
  userAddress: string;
  reason: string;
  description: string;
  status: string;
  resolution?: string;
  refundAmount?: number;
  createdAt: string;
};

type LocalDisputeItem = {
  order: {
    id: string;
    item: string;
    amount: number;
    stage: string;
    userAddress?: string;
    companionAddress?: string;
  };
  dispute: LocalDispute;
  source: "table" | "legacy";
};

const formatAmount = (v: string) => {
  const num = Number(v);
  if (!Number.isFinite(num)) return v;
  return (num / 100).toFixed(2);
};
export default function DisputesPage() {
  const [chainDisputes, setChainDisputes] = useState<ChainDispute[]>([]);
  const [localDisputes, setLocalDisputes] = useState<LocalDisputeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [bps, setBps] = useState<Record<string, { service: string; deposit: string }>>({});
  const [resolveForm, setResolveForm] = useState<
    Record<string, { resolution: string; amount: string; note: string }>
  >({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [chainRes, ordersRes] = await Promise.all([
        fetch("/api/admin/chain/orders"),
        fetch("/api/admin/disputes?limit=50"),
      ]);
      if (chainRes.ok) {
        const data = await chainRes.json();
        const orders = Array.isArray(data?.orders) ? data.orders : [];
        setChainDisputes(orders.filter((o: ChainDispute) => o.status === 4));
      }
      if (ordersRes.ok) {
        const data = await ordersRes.json();
        setLocalDisputes(Array.isArray(data?.items) ? data.items : []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const resolveChain = async (orderId: string) => {
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
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setToast(`解决失败：${data?.error || res.status}`);
        return;
      }
      setToast("链上争议已解决");
      load();
    } catch (e) {
      setToast(`解决失败：${(e as Error).message}`);
    } finally {
      setAction(null);
    }
  };
  const resolveLocal = async (orderId: string) => {
    const form = resolveForm[orderId] || { resolution: "reject", amount: "0", note: "" };
    setAction(orderId);
    try {
      const res = await fetch("/api/admin/disputes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          resolution: form.resolution,
          refundAmount: Number(form.amount || 0),
          note: form.note,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setToast(`解决失败：${data?.error || res.status}`);
        return;
      }
      setToast("争议已解决");
      load();
    } catch (e) {
      setToast(`解决失败：${(e as Error).message}`);
    } finally {
      setAction(null);
    }
  };

  return (
    <div className="admin-section">
      {toast && (
        <div
          className="admin-card"
          style={{ background: "#ecfdf5", padding: 12, marginBottom: 12 }}
        >
          <div className="text-sm text-emerald-700">{toast}</div>
        </div>
      )}

      {/* 链上争议 */}
      <div className="admin-card">
        <div className="admin-card-header">
          <h3>链上争议</h3>
          <div className="admin-card-actions">
            <span className="admin-pill">共 {chainDisputes.length} 条</span>
            <button className="admin-btn ghost" onClick={load} disabled={loading}>
              刷新
            </button>
          </div>
        </div>
        {loading ? (
          <StateBlock tone="loading" size="compact" title="加载中…" />
        ) : chainDisputes.length === 0 ? (
          <StateBlock
            tone="empty"
            size="compact"
            title="暂无链上争议"
            description="当前没有待处理的链上争议订单"
          />
        ) : (
          <div className="admin-stack">
            {chainDisputes.map((order) => (
              <div key={order.orderId} className="admin-card admin-card--subtle">
                <div
                  className="admin-card-header"
                  style={{ alignItems: "flex-start", flexWrap: "wrap" }}
                >
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
                  <div
                    className="admin-card-actions"
                    style={{ flexDirection: "column", alignItems: "stretch" }}
                  >
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        className="admin-input"
                        style={{ width: 90 }}
                        placeholder="退费 bps"
                        value={bps[order.orderId]?.service || ""}
                        onChange={(e) =>
                          setBps((prev) => ({
                            ...prev,
                            [order.orderId]: { ...prev[order.orderId], service: e.target.value },
                          }))
                        }
                      />
                      <input
                        className="admin-input"
                        style={{ width: 90 }}
                        placeholder="扣押金 bps"
                        value={bps[order.orderId]?.deposit || ""}
                        onChange={(e) =>
                          setBps((prev) => ({
                            ...prev,
                            [order.orderId]: { ...prev[order.orderId], deposit: e.target.value },
                          }))
                        }
                      />
                    </div>
                    <button
                      className="admin-btn primary"
                      style={{ marginTop: 8 }}
                      disabled={action === order.orderId}
                      onClick={() => resolveChain(order.orderId)}
                    >
                      {action === order.orderId ? "处理中…" : "解决争议"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* 非链上争议 */}
      <div className="admin-card" style={{ marginTop: 16 }}>
        <div className="admin-card-header">
          <h3>平台争议</h3>
          <div className="admin-card-actions">
            <span className="admin-pill">共 {localDisputes.length} 条</span>
          </div>
        </div>
        {loading ? (
          <StateBlock tone="loading" size="compact" title="加载中…" />
        ) : localDisputes.length === 0 ? (
          <StateBlock
            tone="empty"
            size="compact"
            title="暂无平台争议"
            description="当前没有待处理的平台争议订单"
          />
        ) : (
          <div className="admin-stack">
            {localDisputes.map((entry) => {
              const order = entry.order;
              const dispute = entry.dispute;
              const form = resolveForm[order.id] || { resolution: "reject", amount: "0", note: "" };
              return (
                <div key={order.id} className="admin-card admin-card--subtle">
                  <div
                    className="admin-card-header"
                    style={{ alignItems: "flex-start", flexWrap: "wrap" }}
                  >
                    <div>
                      <div className="admin-text-strong">订单 #{order.id}</div>
                      <div className="admin-meta">
                        {order.item} · ¥{order.amount}
                      </div>
                      <div className="admin-meta" style={{ marginTop: 4 }}>
                        原因：{dispute.reason} · {dispute.description}
                      </div>
                      {order.userAddress && (
                        <div className="admin-meta" style={{ marginTop: 2 }}>
                          用户 {order.userAddress.slice(0, 6)}...{order.userAddress.slice(-4)}
                        </div>
                      )}
                    </div>
                    <div
                      className="admin-card-actions"
                      style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}
                    >
                      <select
                        className="admin-input"
                        value={form.resolution}
                        onChange={(e) =>
                          setResolveForm((prev) => ({
                            ...prev,
                            [order.id]: { ...form, resolution: e.target.value },
                          }))
                        }
                      >
                        <option value="reject">驳回（订单完成）</option>
                        <option value="refund">全额退款</option>
                        <option value="partial">部分退款</option>
                      </select>
                      {form.resolution === "partial" && (
                        <input
                          className="admin-input"
                          placeholder="退款金额"
                          type="number"
                          value={form.amount}
                          onChange={(e) =>
                            setResolveForm((prev) => ({
                              ...prev,
                              [order.id]: { ...form, amount: e.target.value },
                            }))
                          }
                        />
                      )}
                      <input
                        className="admin-input"
                        placeholder="备注（可选）"
                        value={form.note}
                        onChange={(e) =>
                          setResolveForm((prev) => ({
                            ...prev,
                            [order.id]: { ...form, note: e.target.value },
                          }))
                        }
                      />
                      <button
                        className="admin-btn primary"
                        disabled={action === order.id}
                        onClick={() => resolveLocal(order.id)}
                      >
                        {action === order.id ? "处理中…" : "解决争议"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
