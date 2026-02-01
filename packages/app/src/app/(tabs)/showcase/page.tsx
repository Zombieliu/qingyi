"use client";
import { useEffect, useState } from "react";
import { type LocalOrder } from "@/app/components/order-store";
import { deleteOrder, fetchOrders, patchOrder } from "@/app/components/order-service";
import { Activity, Clock3, Car, MapPin } from "lucide-react";
import {
  type ChainOrder,
  cancelOrderOnChain,
  fetchChainOrders,
  finalizeNoDisputeOnChain,
  getCurrentAddress,
  isChainOrdersEnabled,
  isVisualTestMode,
  lockDepositOnChain,
  markCompletedOnChain,
  payServiceFeeOnChain,
  raiseDisputeOnChain,
} from "@/lib/qy-chain";

export default function Showcase() {
  const [orders, setOrders] = useState<LocalOrder[]>([]);
  const [chainOrders, setChainOrders] = useState<ChainOrder[]>([]);
  const [chainLoading, setChainLoading] = useState(false);
  const [chainError, setChainError] = useState<string | null>(null);
  const [chainToast, setChainToast] = useState<string | null>(null);
  const [chainAction, setChainAction] = useState<string | null>(null);
  const [chainAddress, setChainAddress] = useState("");

  const refreshOrders = async () => {
    const list = await fetchOrders();
    setOrders(list);
  };

  useEffect(() => {
    refreshOrders();
  }, []);

  const loadChain = async () => {
    if (!isChainOrdersEnabled()) return;
    const visualTest = isVisualTestMode();
    try {
      if (!visualTest) {
        setChainLoading(true);
      }
      setChainError(null);
      setChainAddress(getCurrentAddress());
      const list = await fetchChainOrders();
      setChainOrders(list);
    } catch (e) {
      setChainError((e as Error).message || "链上订单加载失败");
    } finally {
      if (!visualTest) {
        setChainLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!isChainOrdersEnabled()) return;
    loadChain();
  }, []);

  const accept = async (id: string) => {
    await patchOrder(id, {
      status: "待用户支付打手费",
      depositPaid: true,
      playerPaid: false,
      driver: {
        name: "护航·刘师傅",
        car: "白色新能源汽车",
        eta: "2.7公里 · 5分钟",
        plate: "苏RF M9358",
        phone: "138****0000",
        price: 63,
      },
      userAddress: getCurrentAddress(),
    });
    await refreshOrders();
  };

  const cancel = async (id: string) => {
    await patchOrder(id, {
      status: "取消",
      driver: undefined,
      time: new Date().toISOString(),
      userAddress: getCurrentAddress(),
    });
    await deleteOrder(id, getCurrentAddress());
    await refreshOrders();
  };

  const complete = async (id: string) => {
    await patchOrder(id, {
      status: "已完成",
      time: new Date().toISOString(),
      userAddress: getCurrentAddress(),
    });
    await deleteOrder(id, getCurrentAddress());
    await refreshOrders();
  };

  const clearAll = async () => {
    if (!orders.length) return;
    for (const order of orders) {
      await deleteOrder(order.id, getCurrentAddress());
    }
    await refreshOrders();
  };

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
        return `未知状态(${status})`;
    }
  };

  const formatAmount = (value: string) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return value;
    return (num / 100).toFixed(2);
  };

  const formatTime = (value: string) => {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return "-";
    return new Date(num).toLocaleString();
  };

  const shortAddr = (addr: string) => {
    if (!addr) return "-";
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const runChainAction = async (key: string, action: () => Promise<{ digest: string }>, success: string) => {
    try {
      setChainAction(key);
      await action();
      setChainToast(success);
      await loadChain();
    } catch (e) {
      setChainToast((e as Error).message || "链上操作失败");
    } finally {
      setChainAction(null);
      setTimeout(() => setChainToast(null), 3000);
    }
  };

  const visibleChainOrders =
    chainAddress && chainAddress.length > 0
      ? chainOrders.filter((o) => o.user === chainAddress || o.companion === chainAddress)
      : chainOrders;

  return (
    <div className="dl-shell">
      <header className="dl-topbar">
        <div className="dl-time">
          <span className="dl-time-text">接单大厅</span>
          {isChainOrdersEnabled() ? <span className="dl-chip">链上 + 客户端</span> : <span className="dl-chip">客户端缓存</span>}
        </div>
        <div className="dl-actions">
          <span className="dl-icon-circle">
            <Activity size={16} />
          </span>
          {isChainOrdersEnabled() && (
            <button className="dl-icon-circle" onClick={loadChain} aria-label="刷新链上订单">
              <span style={{ fontSize: 12 }}>链</span>
            </button>
          )}
          <button className="dl-icon-circle" onClick={clearAll} aria-label="清空订单">
            <span style={{ fontSize: 12 }}>清</span>
          </button>
        </div>
      </header>

      {isChainOrdersEnabled() && (
        <div className="space-y-3 mb-6">
          <div className="dl-card text-xs text-gray-500">
            <div>链上订单（Passkey 地址：{chainAddress ? shortAddr(chainAddress) : "未登录"}）</div>
            {chainLoading && <div className="mt-1 text-amber-600">加载中…</div>}
            {chainError && <div className="mt-1 text-rose-500">{chainError}</div>}
            {chainToast && <div className="mt-1 text-emerald-600">{chainToast}</div>}
          </div>
          {visibleChainOrders.length === 0 && !chainLoading ? (
            <div className="dl-card text-sm text-slate-500">暂无链上订单。</div>
          ) : (
            <div className="space-y-3">
              {visibleChainOrders.map((o) => {
                const isUser = chainAddress && o.user === chainAddress;
                const isCompanion = chainAddress && o.companion === chainAddress;
                const now = Date.now();
                const deadline = Number(o.disputeDeadline);
                const canFinalize = o.status === 3 && Number.isFinite(deadline) && now > deadline;
                const canDispute = o.status === 3 && Number.isFinite(deadline) && now <= deadline;
                return (
                  <div key={`chain-${o.orderId}`} className="dl-card" style={{ padding: 14 }}>
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-gray-900">链上订单 #{o.orderId}</div>
                      <div className="text-sm font-bold text-amber-600">¥{formatAmount(o.serviceFee)}</div>
                    </div>
                    <div className="mt-2 text-xs text-gray-500">
                      用户 {shortAddr(o.user)} · 陪玩 {shortAddr(o.companion)}
                    </div>
                    <div className="mt-2 text-xs text-gray-500">
                      状态：{statusLabel(o.status)} · 押金 ¥{formatAmount(o.deposit)}
                    </div>
                    <div className="mt-2 text-xs text-gray-500">
                      创建时间：{formatTime(o.createdAt)} · 争议截止：{formatTime(o.disputeDeadline)}
                    </div>
                    <div className="mt-3 flex gap-2 flex-wrap">
                      {isUser && o.status === 0 && (
                        <button
                          className="dl-tab-btn"
                          style={{ padding: "8px 10px" }}
                          disabled={chainAction === `pay-${o.orderId}`}
                          onClick={() =>
                            runChainAction(`pay-${o.orderId}`, () => payServiceFeeOnChain(o.orderId), "撮合费已上链")
                          }
                        >
                          支付撮合费
                        </button>
                      )}
                      {isUser && (o.status === 0 || o.status === 1) && (
                        <button
                          className="dl-tab-btn"
                          style={{ padding: "8px 10px" }}
                          disabled={chainAction === `cancel-${o.orderId}`}
                          onClick={() =>
                            runChainAction(`cancel-${o.orderId}`, () => cancelOrderOnChain(o.orderId), "订单已取消")
                          }
                        >
                          取消订单
                        </button>
                      )}
                      {isCompanion && o.status === 1 && (
                        <button
                          className="dl-tab-btn"
                          style={{ padding: "8px 10px" }}
                          disabled={chainAction === `deposit-${o.orderId}`}
                          onClick={() =>
                            runChainAction(`deposit-${o.orderId}`, () => lockDepositOnChain(o.orderId), "押金已锁定")
                          }
                        >
                          付押金接单
                        </button>
                      )}
                      {isUser && o.status === 2 && (
                        <button
                          className="dl-tab-btn"
                          style={{ padding: "8px 10px" }}
                          disabled={chainAction === `complete-${o.orderId}`}
                          onClick={() =>
                            runChainAction(`complete-${o.orderId}`, () => markCompletedOnChain(o.orderId), "已确认完成")
                          }
                        >
                          确认完成
                        </button>
                      )}
                      {(isUser || isCompanion) && canDispute && (
                        <button
                          className="dl-tab-btn"
                          style={{ padding: "8px 10px" }}
                          disabled={chainAction === `dispute-${o.orderId}`}
                          onClick={() => {
                            const evidence = window.prompt("请输入争议说明或证据哈希（可留空）") || "";
                            runChainAction(
                              `dispute-${o.orderId}`,
                              () => raiseDisputeOnChain(o.orderId, evidence),
                              "已提交争议"
                            );
                          }}
                        >
                          发起争议
                        </button>
                      )}
                      {(isUser || isCompanion) && canFinalize && (
                        <button
                          className="dl-tab-btn"
                          style={{ padding: "8px 10px" }}
                          disabled={chainAction === `finalize-${o.orderId}`}
                          onClick={() =>
                            runChainAction(
                              `finalize-${o.orderId}`,
                              () => finalizeNoDisputeOnChain(o.orderId),
                              "订单已结算"
                            )
                          }
                        >
                          无争议结算
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {orders.length === 0 ? (
        <div className="dl-card text-sm text-slate-500">暂无呼叫记录，去首页/安排页选择服务吧。</div>
      ) : (
        <div className="space-y-3">
          {orders.map((o, idx) =>
            o.driver ? (
              <div key={`${o.id}-${idx}`} className="dl-card" style={{ padding: 14, borderColor: "#fed7aa", background: "#fff7ed" }}>
                <div className="flex items-center gap-2 text-amber-600 text-sm font-semibold">
                  <Car size={16} />
                  司机正在赶来
                </div>
                <div className="mt-2 flex items-center gap-6 text-sm text-gray-900">
                  <div>
                    <div className="font-bold">{o.driver.name}</div>
                    <div className="text-xs text-gray-500">{o.driver.car}</div>
                  </div>
                  <div className="text-right text-sm">
                    <div className="font-semibold text-emerald-600">{o.driver.eta}</div>
                    {o.driver.price && <div className="text-xs text-gray-500">一口价 ¥{o.driver.price / 10}</div>}
                  </div>
                </div>
                <div className="mt-2 text-xs text-gray-500 flex items-center gap-2">
                  <MapPin size={14} />
                  取货用车
                </div>
                <div className="mt-2 text-xs">
                  <span className="text-emerald-600 font-semibold mr-2">押金已付</span>
                  {o.playerPaid ? (
                    <span className="text-emerald-700 font-semibold">打手费已付，进行中</span>
                  ) : (
                    <span className="text-red-500 font-semibold">等待用户支付打手费</span>
                  )}
                </div>
                <div className="mt-3 flex items-center gap-10 text-sm">
                  <div>
                    <div className="text-gray-900">{o.item}</div>
                    <div className="text-xs text-gray-500">订单号：{o.id}</div>
                  </div>
                  <div className="text-xs text-gray-500">{new Date(o.time).toLocaleString()}</div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button className="dl-tab-btn" style={{ padding: "8px 10px" }} onClick={() => cancel(o.id)}>
                    取消用车
                  </button>
                  <button className="dl-tab-btn" style={{ padding: "8px 10px" }} onClick={() => complete(o.id)}>
                    完成
                  </button>
                  <button className="dl-tab-btn" style={{ padding: "8px 10px", background: "#f97316", color: "#fff" }}>
                    联系司机
                  </button>
                </div>
              </div>
            ) : (
              <div key={`${o.id}-${idx}`} className="dl-card" style={{ padding: 14 }}>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-gray-900">{o.item}</div>
                  <div className="text-sm font-bold text-amber-600">¥{o.amount}</div>
                </div>
                <div className="mt-2 text-xs text-gray-500 flex items-center gap-2">
                  <Clock3 size={14} />
                  <span>{new Date(o.time).toLocaleString()}</span>
                  <span className="text-amber-600 font-semibold">等待支付押金后接单</span>
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  状态：{o.status} · 撮合费{typeof o.serviceFee === "number" ? ` ¥${o.serviceFee.toFixed(2)}` : "已付"}
                </div>
                <div className="mt-2 text-xs text-orange-600">需先付押金再接单</div>
                <div className="mt-3 flex gap-2">
                  <button className="dl-tab-btn" style={{ padding: "8px 10px" }} onClick={() => accept(o.id)}>
                    付押金并接单
                  </button>
                  <button className="dl-tab-btn" style={{ padding: "8px 10px" }} onClick={() => cancel(o.id)}>
                    取消
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      )}
      <div className="text-xs text-gray-500 mt-6">
        订单来自服务端；链上订单以 Passkey 地址过滤展示并可执行押金/结算流程。
      </div>
    </div>
  );
}
