"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

type ChainOrder = {
  orderId: string;
  user: string;
  companion: string;
  serviceFee: string;
  deposit: string;
  status: number;
  createdAt: string;
  disputeDeadline: string;
};

export default function ChainPage() {
  const [chainOrders, setChainOrders] = useState<ChainOrder[]>([]);
  const [missingLocal, setMissingLocal] = useState<ChainOrder[]>([]);
  const [missingChain, setMissingChain] = useState<Array<{ id: string; user: string; item: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [action, setAction] = useState<string | null>(null);
  const [bps, setBps] = useState<Record<string, { service: string; deposit: string }>>({});

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/chain/orders");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || "加载失败");
        return;
      }
      const data = await res.json();
      setChainOrders(Array.isArray(data?.chainOrders) ? data.chainOrders : []);
      setMissingLocal(Array.isArray(data?.missingLocal) ? data.missingLocal : []);
      setMissingChain(Array.isArray(data?.missingChain) ? data.missingChain : []);
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

  const formatAmount = (value: string) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return value;
    return (num / 100).toFixed(2);
  };

  const disputedOrders = useMemo(
    () => chainOrders.filter((order) => order.status === 4),
    [chainOrders]
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

  return (
    <div className="admin-section">
      <div className="admin-card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h3>链上订单对账</h3>
            <p>对比链上订单与后台订单记录，处理争议裁决。</p>
          </div>
          <button className="admin-btn ghost" onClick={loadData} disabled={loading}>
            <RefreshCw size={16} style={{ marginRight: 6 }} />
            刷新
          </button>
        </div>
        {error ? (
          <div className="admin-badge warm" style={{ marginTop: 12 }}>
            {error}
          </div>
        ) : null}
      </div>

      <div className="admin-card">
        <h3>链上争议订单</h3>
        {loading ? (
          <p>加载中...</p>
        ) : disputedOrders.length === 0 ? (
          <p>暂无争议订单</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {disputedOrders.map((order) => (
              <div key={order.orderId} className="admin-card" style={{ boxShadow: "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>订单 #{order.orderId}</div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>
                      用户 {order.user.slice(0, 6)}...{order.user.slice(-4)} · 陪玩{" "}
                      {order.companion.slice(0, 6)}...{order.companion.slice(-4)}
                    </div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>
                      撮合费 ¥{formatAmount(order.serviceFee)} · 押金 ¥{formatAmount(order.deposit)}
                    </div>
                  </div>
                  <div>
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
        <h3>链上订单列表</h3>
        {loading ? (
          <p>加载中...</p>
        ) : chainOrders.length === 0 ? (
          <p>暂无链上订单</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>订单号</th>
                  <th>状态</th>
                  <th>撮合费</th>
                  <th>押金</th>
                  <th>争议截止</th>
                </tr>
              </thead>
              <tbody>
                {chainOrders.map((order) => (
                  <tr key={order.orderId}>
                    <td>{order.orderId}</td>
                    <td>{statusLabel(order.status)}</td>
                    <td>¥{formatAmount(order.serviceFee)}</td>
                    <td>¥{formatAmount(order.deposit)}</td>
                    <td>
                      {Number(order.disputeDeadline) > 0
                        ? new Date(Number(order.disputeDeadline)).toLocaleString()
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="admin-card">
        <h3>对账差异</h3>
        {loading ? (
          <p>加载中...</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <strong>链上存在但本地缺失：</strong>
              {missingLocal.length === 0 ? (
                <span> 无</span>
              ) : (
                <span> {missingLocal.length} 条</span>
              )}
            </div>
            <div>
              <strong>本地存在但链上缺失：</strong>
              {missingChain.length === 0 ? (
                <span> 无</span>
              ) : (
                <span> {missingChain.length} 条</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
