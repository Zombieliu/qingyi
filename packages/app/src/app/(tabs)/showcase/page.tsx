"use client";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { type LocalOrder } from "@/app/components/order-store";
import { deleteOrder, fetchOrderDetail, fetchPublicOrders, patchOrder, syncChainOrder } from "@/app/components/order-service";
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
  signAuthIntent,
} from "@/lib/qy-chain";

export default function Showcase() {
  const [orders, setOrders] = useState<LocalOrder[]>([]);
  const [chainOrders, setChainOrders] = useState<ChainOrder[]>([]);
  const [chainLoading, setChainLoading] = useState(false);
  const [chainError, setChainError] = useState<string | null>(null);
  const [chainToast, setChainToast] = useState<string | null>(null);
  const [chainAction, setChainAction] = useState<string | null>(null);
  const [chainAddress, setChainAddress] = useState("");
  const [chainUpdatedAt, setChainUpdatedAt] = useState<number | null>(null);
  const [disputeOpen, setDisputeOpen] = useState<{ orderId: string; evidence: string } | null>(null);
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null);
  const [publicCursor, setPublicCursor] = useState<string | null>(null);
  const [publicLoading, setPublicLoading] = useState(false);
  const [orderMetaOverrides, setOrderMetaOverrides] = useState<Record<string, Record<string, unknown>>>({});
  const [orderMetaLoading, setOrderMetaLoading] = useState<Record<string, boolean>>({});
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const refreshOrders = async () => {
    setPublicLoading(true);
    try {
      const result = await fetchPublicOrders();
      setOrders(result.items);
      setPublicCursor(result.nextCursor || null);
    } finally {
      setPublicLoading(false);
    }
  };

  const loadMoreOrders = useCallback(async () => {
    if (!publicCursor || publicLoading) return;
    setPublicLoading(true);
    try {
      const result = await fetchPublicOrders(publicCursor);
      setOrders((prev) => [...prev, ...result.items]);
      setPublicCursor(result.nextCursor || null);
    } finally {
      setPublicLoading(false);
    }
  }, [publicCursor, publicLoading]);

  useEffect(() => {
    refreshOrders();
  }, []);

  useEffect(() => {
    if (!loadMoreRef.current) return;
    if (!publicCursor) return;
    const target = loadMoreRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first && first.isIntersecting) {
          loadMoreOrders();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [publicCursor, loadMoreOrders]);

  const loadChain = useCallback(async () => {
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
      setChainUpdatedAt(Date.now());
    } catch (e) {
      setChainError((e as Error).message || "订单加载失败");
    } finally {
      if (!visualTest) {
        setChainLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!isChainOrdersEnabled()) return;
    loadChain();
    const timer = window.setInterval(() => {
      if (!chainLoading) {
        loadChain();
      }
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [chainLoading, loadChain]);

  const accept = async (id: string) => {
    const address = getCurrentAddress();
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
      userAddress: address,
      companionAddress: address,
    });
    await refreshOrders();
  };

  const cancel = async (id: string) => {
    const isChainOrder = isChainOrdersEnabled() && /^[0-9]+$/.test(id);
    if (isChainOrder) {
      const chainOrder = chainOrders.find((order) => order.orderId === id) || null;
      if (chainOrder && chainOrder.status >= 2) {
        setChainToast("押金已锁定，无法取消，请走争议/客服处理");
        setTimeout(() => setChainToast(null), 3000);
        return;
      }
      const ok = await runChainAction(
        `cancel-${id}`,
        () => cancelOrderOnChain(id),
        "订单已取消，托管费已退回",
        id
      );
      if (!ok) return;
      return;
    }
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
      driver: undefined,
      time: new Date().toISOString(),
      userAddress: getCurrentAddress(),
    });
    await refreshOrders();
  };

  const clearAll = async () => {
    if (!orders.length) return;
    for (const order of orders) {
      if (order.chainDigest) continue;
      await deleteOrder(order.id, getCurrentAddress());
    }
    await refreshOrders();
  };

  const statusLabel = (status: number) => {
    switch (status) {
      case 0:
        return "已创建";
      case 1:
        return "已托管费用";
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

  const formatRemaining = (value: string) => {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return "-";
    const diff = num - Date.now();
    if (diff <= 0) return "已到期";
    const mins = Math.ceil(diff / 60000);
    if (mins < 60) return `${mins} 分钟`;
    const hours = Math.floor(mins / 60);
    const remain = mins % 60;
    return remain ? `${hours} 小时 ${remain} 分钟` : `${hours} 小时`;
  };

  const disputeOrderId = disputeOpen?.orderId || "";
  const disputeEvidence = disputeOpen?.evidence || "";
  const disputeOrder = useMemo(
    () => chainOrders.find((o) => o.orderId === disputeOrderId) || null,
    [chainOrders, disputeOrderId]
  );

  const hydrateOrderMeta = useCallback(
    async (orderId: string, options: { toastOnError?: boolean } = {}) => {
      if (!orderId || orderMetaLoading[orderId]) return;
      setOrderMetaLoading((prev) => ({ ...prev, [orderId]: true }));
      try {
        const detail = await fetchOrderDetail(orderId);
        if (detail?.meta && typeof detail.meta === "object") {
          setOrderMetaOverrides((prev) => ({ ...prev, [orderId]: detail.meta as Record<string, unknown> }));
        }
        return detail;
      } catch (error) {
        if (options.toastOnError) {
          setChainToast((error as Error).message || "加载用户信息失败");
          setTimeout(() => setChainToast(null), 3000);
        }
      } finally {
        setOrderMetaLoading((prev) => {
          if (!prev[orderId]) return prev;
          const next = { ...prev };
          delete next[orderId];
          return next;
        });
      }
    },
    [orderMetaLoading]
  );

  const orderMetaById = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    for (const order of orders) {
      if (order.meta && typeof order.meta === "object") {
        map.set(order.id, order.meta as Record<string, unknown>);
      }
    }
    Object.entries(orderMetaOverrides).forEach(([orderId, meta]) => {
      if (meta && typeof meta === "object") {
        map.set(orderId, meta);
      }
    });
    return map;
  }, [orders, orderMetaOverrides]);

  const copyGameProfile = async (orderId: string, profile: { gameName?: string; gameId?: string }) => {
    const text = [profile.gameName ? `游戏名 ${profile.gameName}` : "", profile.gameId ? `ID ${profile.gameId}` : ""]
      .filter(Boolean)
      .join(" · ");
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setChainToast("已复制游戏名/ID");
      setCopiedOrderId(orderId);
    } catch {
      const input = document.createElement("textarea");
      input.value = text;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.focus();
      input.select();
      try {
        document.execCommand("copy");
        setChainToast("已复制游戏名/ID");
        setCopiedOrderId(orderId);
      } catch {
        setChainToast("复制失败，请手动复制");
      } finally {
        document.body.removeChild(input);
      }
    } finally {
      setTimeout(() => setChainToast(null), 3000);
      setTimeout(() => setCopiedOrderId(null), 2000);
    }
  };

  const shortAddr = (addr: string) => {
    if (!addr) return "-";
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const runChainAction = async (
    key: string,
    action: () => Promise<{ digest: string }>,
    success: string,
    syncOrderId?: string
  ) => {
    try {
      setChainAction(key);
      await action();
      setChainToast(success);
      await loadChain();
      if (syncOrderId) {
        try {
          await syncChainOrder(syncOrderId, getCurrentAddress());
          await refreshOrders();
        } catch (e) {
          setChainToast(`订单已完成，但同步失败：${(e as Error).message || "未知错误"}`);
        }
      }
      return true;
    } catch (e) {
      setChainToast((e as Error).message || "操作失败");
      return false;
    } finally {
      setChainAction(null);
      setTimeout(() => setChainToast(null), 3000);
    }
  };

  const visibleChainOrders = (
    chainAddress && chainAddress.length > 0
      ? chainOrders.filter((o) => o.user === chainAddress || o.companion === chainAddress)
      : chainOrders
  ).filter((o) => o.status !== 6);

  const visibleOrders = orders.filter((o) => !o.status.includes("完成") && !o.status.includes("取消"));

  return (
    <div className="dl-shell">
      <header className="dl-topbar">
        <div className="dl-time">
          <span className="dl-time-text">接单大厅</span>
          {isChainOrdersEnabled() ? <span className="dl-chip">系统 + 客户端</span> : <span className="dl-chip">客户端缓存</span>}
        </div>
        <div className="dl-actions">
          <span className="dl-icon-circle">
            <Activity size={16} />
          </span>
          {isChainOrdersEnabled() && (
            <button
              className="dl-icon-circle"
              onClick={loadChain}
              aria-label="刷新订单"
              disabled={chainLoading}
              title={chainLoading ? "刷新中..." : "刷新订单"}
            >
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
            <div>订单（{chainAddress ? "已登录" : "未登录"}）</div>
            <div className="mt-1">上次刷新：{chainUpdatedAt ? new Date(chainUpdatedAt).toLocaleTimeString() : "-"}</div>
            {chainLoading && <div className="mt-1 text-amber-600">加载中…</div>}
            {chainError && <div className="mt-1 text-rose-500">{chainError}</div>}
            {chainToast && <div className="mt-1 text-emerald-600">{chainToast}</div>}
          </div>
          {visibleChainOrders.length === 0 && !chainLoading ? (
            <div className="dl-card text-sm text-slate-500">暂无订单。</div>
          ) : (
            <div className="space-y-3">
              {visibleChainOrders.map((o) => {
                const isUser = chainAddress && o.user === chainAddress;
                const isCompanion = chainAddress && o.companion === chainAddress;
                const now = Date.now();
                const deadline = Number(o.disputeDeadline);
                const canFinalize = o.status === 3 && Number.isFinite(deadline) && now > deadline;
                const canDispute = o.status === 3 && Number.isFinite(deadline) && now <= deadline;
                const meta = orderMetaById.get(o.orderId) || null;
                const gameProfile = (meta?.gameProfile || null) as { gameName?: string; gameId?: string } | null;
                const metaLoading = Boolean(orderMetaLoading[o.orderId]);
                return (
                  <div key={`chain-${o.orderId}`} className="dl-card" style={{ padding: 14 }}>
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-gray-900">订单 #{o.orderId}</div>
                      <div className="text-sm font-bold text-amber-600">¥{formatAmount(o.serviceFee)}</div>
                    </div>
                    <div className="mt-2 text-xs text-gray-500">
                      用户 {shortAddr(o.user)} · 陪玩 {shortAddr(o.companion)}
                    </div>
                    {isCompanion && o.status >= 2 && (
                      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-emerald-700">
                        <span>
                          {gameProfile?.gameName && gameProfile?.gameId
                            ? `游戏名 ${gameProfile.gameName} · ID ${gameProfile.gameId}`
                            : "用户未填写游戏名/ID"}
                        </span>
                        <div className="flex items-center gap-2">
                          {gameProfile?.gameName && gameProfile?.gameId ? (
                            <>
                              {copiedOrderId === o.orderId && (
                                <span className="text-[11px] text-emerald-600" aria-live="polite">
                                  已复制
                                </span>
                              )}
                              <button
                                type="button"
                                className="dl-tab-btn"
                                style={{
                                  padding: "4px 10px",
                                  borderColor: "#34d399",
                                  background: "#ecfdf5",
                                  color: "#059669",
                                }}
                                onClick={() => copyGameProfile(o.orderId, gameProfile)}
                              >
                                复制
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="dl-tab-btn"
                              style={{
                                padding: "4px 10px",
                                borderColor: "#fde68a",
                                background: "#fffbeb",
                                color: "#b45309",
                              }}
                              onClick={() => hydrateOrderMeta(o.orderId, { toastOnError: true })}
                              disabled={metaLoading}
                            >
                              {metaLoading ? "加载中..." : "加载用户信息"}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="mt-2 text-xs text-gray-500">
                      状态：{statusLabel(o.status)} · 押金 ¥{formatAmount(o.deposit)}
                    </div>
                    <div className="mt-2 text-xs text-gray-500">
                      创建时间：{formatTime(o.createdAt)} · 争议截止：{formatTime(o.disputeDeadline)}
                    </div>
                    {o.status === 3 && (
                      <div className="mt-1 text-xs text-amber-700">
                        争议剩余：{formatRemaining(o.disputeDeadline)}
                      </div>
                    )}
                    <div className="mt-3 flex gap-2 flex-wrap">
                      {isUser && o.status === 0 && (
                        <button
                          className="dl-tab-btn"
                          style={{ padding: "8px 10px" }}
                          disabled={chainAction === `pay-${o.orderId}`}
                          onClick={() =>
                            runChainAction(
                              `pay-${o.orderId}`,
                              () => payServiceFeeOnChain(o.orderId),
                              "撮合费已提交",
                              o.orderId
                            )
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
                            runChainAction(
                              `cancel-${o.orderId}`,
                              () => cancelOrderOnChain(o.orderId),
                              "订单已取消",
                              o.orderId
                            )
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
                          onClick={async () => {
                            if (!window.confirm("确认付押金并接单？押金锁定后如需取消请走争议/客服流程。")) {
                              return;
                            }
                            if (!orderMetaById.get(o.orderId)?.gameProfile) {
                              await hydrateOrderMeta(o.orderId);
                            }
                            const ok = await runChainAction(
                              `deposit-${o.orderId}`,
                              () => lockDepositOnChain(o.orderId),
                              "押金已锁定",
                              o.orderId
                            );
                            if (!ok) return;
                            await hydrateOrderMeta(o.orderId, { toastOnError: true });
                            try {
                              const creditBody = JSON.stringify({ orderId: o.orderId, address: chainAddress });
                              const auth = await signAuthIntent(`mantou:credit:${o.orderId}`, creditBody);
                              const res = await fetch("/api/mantou/credit", {
                                method: "POST",
                                headers: {
                                  "Content-Type": "application/json",
                                  "x-auth-address": auth.address,
                                  "x-auth-signature": auth.signature,
                                  "x-auth-timestamp": String(auth.timestamp),
                                  "x-auth-nonce": auth.nonce,
                                  "x-auth-body-sha256": auth.bodyHash,
                                },
                                body: creditBody,
                              });
                              const data = await res.json().catch(() => ({}));
                              if (res.ok) {
                                if (!data?.duplicated) {
                                  setChainToast("已自动转换为馒头");
                                }
                              } else {
                                setChainToast(data?.error || "馒头转换失败");
                              }
                            } catch (error) {
                              setChainToast((error as Error).message || "馒头转换失败");
                            } finally {
                              setTimeout(() => setChainToast(null), 3000);
                            }
                          }}
                        >
                          付押金接单
                        </button>
                      )}
                      {isUser && o.status === 2 && (
                        <button
                          className="dl-tab-btn"
                          style={{ padding: "8px 10px" }}
                          disabled={chainAction === `complete-${o.orderId}`}
                          onClick={() => {
                            if (!window.confirm("确认服务已完成？确认后将进入结算/争议期。")) {
                              return;
                            }
                            runChainAction(
                              `complete-${o.orderId}`,
                              () => markCompletedOnChain(o.orderId),
                              "已确认完成",
                              o.orderId
                            );
                          }}
                        >
                          确认完成
                        </button>
                      )}
                      {(isUser || isCompanion) && canDispute && (
                        <button
                          className="dl-tab-btn"
                          style={{ padding: "8px 10px" }}
                          disabled={chainAction === `dispute-${o.orderId}`}
                          onClick={() => setDisputeOpen({ orderId: o.orderId, evidence: "" })}
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
                              "订单已结算",
                              o.orderId
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

      {visibleOrders.length === 0 ? (
        <div className="dl-card text-sm text-slate-500">暂无呼叫记录，去首页/安排页选择服务吧。</div>
      ) : (
        <div className="space-y-3">
          {visibleOrders.map((o, idx) =>
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
                {o.userAddress && o.userAddress === chainAddress ? (
                  <div className="mt-2 text-xs text-rose-500">不能接自己发的单</div>
                ) : (
                  <div className="mt-2 text-xs text-orange-600">需先付押金再接单</div>
                )}
                <div className="mt-3 flex gap-2">
                  <button
                    className="dl-tab-btn"
                    style={{ padding: "8px 10px" }}
                    onClick={() => accept(o.id)}
                    disabled={Boolean(o.userAddress && o.userAddress === chainAddress)}
                    title={o.userAddress && o.userAddress === chainAddress ? "不能接自己发的单" : undefined}
                  >
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
      <div className="mt-4 flex justify-center" ref={loadMoreRef}>
        {publicCursor ? (
          <button
            className="dl-tab-btn"
            style={{ padding: "8px 12px" }}
            onClick={loadMoreOrders}
            disabled={publicLoading}
          >
            {publicLoading ? "加载中..." : "加载更多"}
          </button>
        ) : (
          <div className="text-xs text-gray-400">没有更多了</div>
        )}
      </div>
      {disputeOpen && (
        <div className="ride-modal-mask" role="dialog" aria-modal="true" aria-label="发起争议">
          <div className="ride-modal">
            <div className="ride-modal-head">
              <div>
                <div className="ride-modal-title">发起争议</div>
                <div className="ride-modal-sub">请填写争议说明或证据哈希（可留空）</div>
              </div>
              <div className="ride-modal-amount">#{disputeOpen.orderId}</div>
            </div>
            <div className="ride-qr-inline">
              <textarea
                className="admin-input"
                style={{ width: "100%", minHeight: 120 }}
                placeholder="请输入争议说明或证据哈希"
                value={disputeEvidence}
                onChange={(e) => setDisputeOpen({ orderId: disputeOpen.orderId, evidence: e.target.value })}
              />
              {disputeOrder?.disputeDeadline ? (
                <div className="text-xs text-gray-500 mt-2">
                  争议截止：{formatTime(disputeOrder.disputeDeadline)}（剩余 {formatRemaining(disputeOrder.disputeDeadline)}）
                </div>
              ) : null}
            </div>
            <div className="ride-modal-actions">
              <button className="dl-tab-btn" onClick={() => setDisputeOpen(null)}>
                取消
              </button>
              <button
                className="dl-tab-btn"
                style={{ background: "#0f172a", color: "#fff" }}
                onClick={() => {
                  const orderId = disputeOpen.orderId;
                  const evidence = disputeOpen.evidence.trim();
                  setDisputeOpen(null);
                  runChainAction(
                    `dispute-${orderId}`,
                    () => raiseDisputeOnChain(orderId, evidence),
                    "已提交争议",
                    orderId
                  );
                }}
              >
                提交争议
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="text-xs text-gray-500 mt-6">
        订单来自服务端；可执行押金/结算流程。
      </div>
    </div>
  );
}
