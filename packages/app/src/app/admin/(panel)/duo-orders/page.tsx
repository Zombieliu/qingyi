"use client";
import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Users } from "lucide-react";
import { StateBlock } from "@/app/components/state-block";
import { useAdminSession, roleRank } from "../admin-session";

type DuoOrderRow = {
  id: string;
  user: string;
  userAddress?: string;
  companionAddressA?: string;
  companionAddressB?: string;
  item: string;
  amount: number;
  stage: string;
  teamStatus?: number;
  chainStatus?: number;
  serviceFee?: number;
  depositPerCompanion?: number;
  createdAt: number;
};

const TEAM_LABELS: Record<number, string> = {
  0: "等待组队",
  1: "A已缴押",
  2: "B已缴押",
  3: "双人就位",
};

export default function AdminDuoOrdersPage() {
  const { role } = useAdminSession();
  const canEdit = roleRank(role) >= roleRank("ops");
  const [orders, setOrders] = useState<DuoOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [releasing, setReleasing] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/duo-orders?pageSize=100");
      if (res.ok) {
        const data = await res.json();
        setOrders(data.items || data.orders || []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const releaseSlot = async (orderId: string, companionAddress: string) => {
    if (!canEdit) return;
    if (!confirm(`确定释放 ${companionAddress.slice(0, 10)}… 的槽位？`)) return;
    setReleasing(orderId);
    try {
      const res = await fetch(`/api/duo-orders/${orderId}/release-slot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companionAddress }),
      });
      if (res.ok) {
        setToast("释放成功");
        await loadOrders();
      } else {
        const data = await res.json().catch(() => ({}));
        setToast(data?.error || "释放失败");
      }
    } catch (e) {
      setToast((e as Error).message || "释放失败");
    } finally {
      setReleasing(null);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const shortAddr = (addr?: string) => (addr ? `${addr.slice(0, 8)}…${addr.slice(-4)}` : "-");

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <Users size={18} className="text-violet-500" /> 双陪订单管理
        </h1>
        <button onClick={loadOrders} className="p-1.5 rounded hover:bg-gray-100" disabled={loading}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
        </button>
      </div>

      {toast && (
        <div className="mb-3 text-sm text-amber-600 bg-amber-50 rounded px-3 py-2">{toast}</div>
      )}

      {loading ? (
        <StateBlock tone="loading" title="加载中…" />
      ) : orders.length === 0 ? (
        <StateBlock tone="empty" title="暂无双陪订单" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-2 px-2">ID</th>
                <th className="py-2 px-2">项目</th>
                <th className="py-2 px-2">金额</th>
                <th className="py-2 px-2">阶段</th>
                <th className="py-2 px-2">组队</th>
                <th className="py-2 px-2">陪练A</th>
                <th className="py-2 px-2">陪练B</th>
                {canEdit && <th className="py-2 px-2">操作</th>}
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b hover:bg-gray-50">
                  <td className="py-2 px-2 font-mono">{o.id.slice(0, 8)}</td>
                  <td className="py-2 px-2">{o.item}</td>
                  <td className="py-2 px-2">¥{o.amount}</td>
                  <td className="py-2 px-2">{o.stage}</td>
                  <td className="py-2 px-2">
                    {TEAM_LABELS[o.teamStatus ?? 0] || String(o.teamStatus)}
                  </td>
                  <td className="py-2 px-2">{shortAddr(o.companionAddressA)}</td>
                  <td className="py-2 px-2">{shortAddr(o.companionAddressB)}</td>
                  {canEdit && (
                    <td className="py-2 px-2 space-x-1">
                      {o.companionAddressA && o.stage !== "已完成" && o.stage !== "已取消" && (
                        <button
                          className="text-red-500 hover:text-red-700"
                          onClick={() => releaseSlot(o.id, o.companionAddressA!)}
                          disabled={releasing === o.id}
                        >
                          释放A
                        </button>
                      )}
                      {o.companionAddressB && o.stage !== "已完成" && o.stage !== "已取消" && (
                        <button
                          className="text-red-500 hover:text-red-700"
                          onClick={() => releaseSlot(o.id, o.companionAddressB!)}
                          disabled={releasing === o.id}
                        >
                          释放B
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
