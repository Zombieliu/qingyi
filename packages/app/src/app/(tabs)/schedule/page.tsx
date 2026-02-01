"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Clock3, ShieldCheck, QrCode, Loader2, CheckCircle2 } from "lucide-react";
import { type LocalOrder } from "@/app/components/order-store";
import { createOrder, deleteOrder, fetchOrders, patchOrder } from "@/app/components/order-service";
import {
  type ChainOrder,
  cancelOrderOnChain,
  createChainOrderId,
  createOrderOnChain,
  fetchChainOrders,
  finalizeNoDisputeOnChain,
  getCurrentAddress,
  isChainOrdersEnabled,
  isVisualTestMode,
  markCompletedOnChain,
  payServiceFeeOnChain,
  raiseDisputeOnChain,
} from "@/lib/qy-chain";

type RideItem = {
  name: string;
  desc: string;
  eta: string;
  price: string;
  old?: string;
  tag?: string;
  bold?: boolean;
  info?: string;
  base?: number;
};

type RideSection = {
  title: string;
  badge?: string;
  highlight?: boolean;
  items: RideItem[];
};

type Mode = "select" | "notifying" | "await-user-pay" | "enroute";

const sections: RideSection[] = [
  {
    title: "推荐单",
    highlight: true,
    items: [
      {
        name: "绝密体验单",
        desc: "15分钟上车",
        eta: "15分钟",
        price: "¥88",
        old: "¥128",
        tag: "已优惠40",
        bold: true,
        info: "保1000W",
      },
      {
        name: "绝密快单",
        desc: "10分钟上车",
        eta: "10分钟",
        price: "¥128",
        old: "¥158",
        info: "保1000W",
      },
    ],
  },
  {
    title: "特价单",
    items: [
      { name: "机密大坝", desc: "单护/双护随机", eta: "5分钟", price: "¥28", tag: "保188" },
      { name: "机密航天", desc: "单护/双护随机", eta: "7分钟", price: "¥38", tag: "保288" },
    ],
  },
  {
    title: "小时单",
    items: [
      { name: "机密单护", desc: "稳定护航", eta: "7分钟", price: "¥30" },
      { name: "机密双护", desc: "双人协同", eta: "8分钟", price: "¥60" },
      { name: "绝密单护", desc: "高强度护航", eta: "10分钟", price: "¥50" },
      { name: "绝密双护", desc: "双核保障", eta: "11分钟", price: "¥100" },
    ],
  },
  {
    title: "趣味单",
    items: [
      { name: "摸油", desc: "保证带油出局", eta: "9分钟", price: "¥588" },
      { name: "摸心", desc: "保证摸到心", eta: "12分钟", price: "¥1288" },
    ],
  },
];

export default function Schedule() {
  const [checked, setChecked] = useState<Record<string, boolean>>(() => ({}));
  const [active, setActive] = useState("推荐");
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [infoOpen, setInfoOpen] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [orders, setOrders] = useState<LocalOrder[]>([]);
  const [mode, setMode] = useState<Mode>("select");
  const [feeOpen, setFeeOpen] = useState(false);
  const [feeChecked, setFeeChecked] = useState(false);
  const [locked, setLocked] = useState<{ total: number; service: number; player: number; items: string[] }>({
    total: 0,
    service: 0,
    player: 0,
    items: [],
  });
  const [calling, setCalling] = useState(false);
  const [playerPaidTick, setPlayerPaidTick] = useState(false);
  const [chainOrders, setChainOrders] = useState<ChainOrder[]>([]);
  const [chainLoading, setChainLoading] = useState(false);
  const [chainError, setChainError] = useState<string | null>(null);
  const [chainToast, setChainToast] = useState<string | null>(null);
  const [chainAction, setChainAction] = useState<string | null>(null);
  const [chainAddress, setChainAddress] = useState("");

  const platformQr = process.env.NEXT_PUBLIC_QR_PLATFORM_FEE || "/qr/platform-fee-qr.svg";
  const playerQr = process.env.NEXT_PUBLIC_QR_PLAYER_FEE || "/qr/player-fee-qr.svg";
  const MATCH_RATE = 0.15;

  const refreshOrders = async () => {
    const list = await fetchOrders();
    setOrders(list);
    setMode(deriveMode(list));
    setPlayerPaidTick(false);
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

  const toggle = (name: string) => setChecked((p) => ({ ...p, [name]: !p[name] }));
  const pickedNames = Object.entries(checked)
    .filter(([, v]) => v)
    .map(([k]) => k);
  const pickedPrice = sections
    .flatMap((s) => s.items)
    .filter((i) => checked[i.name])
    .reduce((sum, item) => {
      const parsed = item.base ?? parseFloat(item.price.replace(/[^\d.]/g, ""));
      return sum + (Number.isFinite(parsed) ? parsed : 0);
    }, 0);

  const currentOrder = useMemo(() => orders.find((o) => o.status !== "取消") || null, [orders]);
  const chainCurrentOrder = useMemo(() => {
    const addr = chainAddress;
    const list = addr
      ? chainOrders.filter((o) => o.user === addr)
      : chainOrders;
    return list.length > 0 ? list[0] : null;
  }, [chainOrders, chainAddress]);

  const playerDue = useMemo(() => {
    if (!currentOrder) return 0;
    if (typeof currentOrder.playerDue === "number") return currentOrder.playerDue;
    const fee = currentOrder.serviceFee ?? Number((currentOrder.amount * MATCH_RATE).toFixed(2));
    return Math.max(Number((currentOrder.amount - fee).toFixed(2)), 0);
  }, [currentOrder]);
  const serviceFeeDisplay =
    currentOrder && typeof currentOrder.serviceFee === "number"
      ? currentOrder.serviceFee
      : currentOrder
        ? Number((currentOrder.amount * MATCH_RATE).toFixed(2))
        : locked.service;

  const cancelOrder = async () => {
    if (!currentOrder) return;
    await deleteOrder(currentOrder.id, chainAddress);
    await refreshOrders();
    setMode("select");
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

  useEffect(() => {
    if (!chainCurrentOrder) return;
    if (!currentOrder || currentOrder.id !== chainCurrentOrder.orderId) return;
    const patch: Partial<LocalOrder> = {};
    if (chainCurrentOrder.status >= 1) patch.serviceFeePaid = true;
    if (chainCurrentOrder.status >= 2) patch.depositPaid = true;
    if (Object.keys(patch).length > 0) {
      patchOrder(currentOrder.id, { ...patch, userAddress: chainAddress });
      refreshOrders();
    }
  }, [chainCurrentOrder, currentOrder]);

  if (mode === "await-user-pay" && currentOrder?.driver) {
    return (
      <div className="ride-shell">
        <div className="ride-tip" style={{ marginTop: 0 }}>
          打手已支付押金，请完成打手费用支付后开始服务
        </div>

        <div className="ride-driver-card dl-card">
          <div className="flex items-center gap-3">
            <div className="ride-driver-avatar" />
            <div>
              <div className="text-sm text-amber-600 font-semibold">等待支付打手费用</div>
              <div className="text-lg font-bold text-gray-900">{currentOrder.driver.name}</div>
              <div className="text-xs text-gray-500">{currentOrder.driver.car}</div>
            </div>
            <div className="ml-auto text-right">
              <div className="text-emerald-600 font-semibold text-sm">{currentOrder.driver.eta}</div>
              {currentOrder.driver.price && <div className="text-xs text-gray-500">一口价 ¥{currentOrder.driver.price / 10}</div>}
            </div>
          </div>
          <div className="ride-driver-actions">
            <button className="dl-tab-btn" onClick={cancelOrder}>取消用车</button>
            <button className="dl-tab-btn" style={{ background: "#f97316", color: "#fff" }}>
              联系司机
            </button>
          </div>
          <div className="text-xs text-gray-500 mt-2">订单：{currentOrder.item}</div>
        </div>

        <div className="ride-pay-box">
          <div className="ride-pay-head">
            <div>
              <div className="ride-pay-title">支付打手费用</div>
              <div className="ride-pay-sub">司机已付押金，付款后开始护航</div>
            </div>
            <div className="ride-pay-amount">¥{playerDue.toFixed(2)}</div>
          </div>
          <div className="ride-qr-inline">
            <div className="ride-qr-img">
              <img src={playerQr} alt="打手收款码" />
            </div>
            <div className="ride-qr-text">
              <div className="text-sm font-semibold text-gray-900">打手收款码</div>
              <div className="text-xs text-gray-500">支付后勾选，系统会通知司机开始</div>
              <label className="ride-status-toggle" style={{ marginTop: 8 }}>
                <input
                  type="checkbox"
                  checked={playerPaidTick}
                  onChange={(e) => setPlayerPaidTick(e.target.checked)}
                  aria-label="已支付打手费用"
                />
                <span>我已支付</span>
                {playerPaidTick && <CheckCircle2 size={16} color="#22c55e" />}
              </label>
            </div>
          </div>
          <div className="ride-pay-actions">
            <button className="dl-tab-btn" onClick={cancelOrder}>取消</button>
            <button
              className="dl-tab-btn"
              style={{ background: "#0f172a", color: "#fff" }}
              onClick={async () => {
                if (!currentOrder) return;
                if (!playerPaidTick) {
                  setToast("请先完成打手费用支付");
                  setTimeout(() => setToast(null), 2000);
                  return;
                }
                await patchOrder(currentOrder.id, { playerPaid: true, status: "打手费已付", userAddress: chainAddress });
                await refreshOrders();
                setMode("enroute");
              }}
            >
              确认已支付
            </button>
          </div>
        </div>
        {toast && <div className="ride-toast">{toast}</div>}
      </div>
    );
  }

  if (mode === "enroute" && currentOrder?.driver) {
    return (
      <div className="ride-shell">
        <div className="ride-map-large">地图加载中…</div>
        <div className="ride-driver-card dl-card">
          <div className="flex items-center gap-3">
            <div className="ride-driver-avatar" />
            <div>
              <div className="text-sm text-amber-600 font-semibold">司机正在赶来</div>
              <div className="text-lg font-bold text-gray-900">{currentOrder.driver.name}</div>
              <div className="text-xs text-gray-500">{currentOrder.driver.car}</div>
            </div>
            <div className="ml-auto text-right">
              <div className="text-emerald-600 font-semibold text-sm">{currentOrder.driver.eta}</div>
              {currentOrder.driver.price && <div className="text-xs text-gray-500">一口价 ¥{currentOrder.driver.price / 10}</div>}
            </div>
          </div>
          <div className="ride-driver-actions">
            <button className="dl-tab-btn" onClick={cancelOrder}>取消用车</button>
            <button className="dl-tab-btn">安全中心</button>
            <button className="dl-tab-btn" style={{ background: "#f97316", color: "#fff" }}>
              联系司机
            </button>
          </div>
          <div className="text-xs text-gray-500 mt-2">订单：{currentOrder.item}</div>
        </div>
      </div>
    );
  }

  if (mode === "notifying" && currentOrder) {
    return (
      <div className="ride-shell">
        <div className="ride-tip" style={{ marginTop: 0 }}>
          正在通知护航，需打手支付押金后才能接单
        </div>
        <div className="ride-stepper">
          <Step label={`撮合费 ¥${serviceFeeDisplay.toFixed(2)} 已收`} done={!!currentOrder.serviceFeePaid} />
          <Step label="打手支付押金" done={!!currentOrder.depositPaid} />
          <Step label="派单匹配" done={!!currentOrder.driver} />
        </div>
        <div className="ride-notify-illu" />
        <div className="dl-card" style={{ padding: 16 }}>
          <div className="text-sm font-semibold text-gray-900 mb-2">已选服务</div>
          <div className="flex justify-between text-sm">
            <span>{currentOrder.item}</span>
            <span className="text-amber-600 font-bold">¥{currentOrder.amount}</span>
          </div>
          <div className="text-xs text-gray-500 mt-2">{new Date(currentOrder.time).toLocaleString()}</div>
          <div className="text-xs text-gray-500 mt-3">押金未付前不会提示用户支付打手费。</div>
        </div>
      </div>
    );
  }

  const submit = () => {
    if (pickedNames.length === 0) {
      setToast("请先选择服务");
      return;
    }
    const total = pickedPrice || Math.max(pickedNames.length * 10, 10);
    const service = Number((total * MATCH_RATE).toFixed(2));
    const player = Math.max(Number((total - service).toFixed(2)), 0);
    setLocked({ total, service, player, items: pickedNames });
    setFeeOpen(true);
    setFeeChecked(false);
  };

  const callOrder = async () => {
    if (!feeChecked) {
      setToast("请先完成撮合费付款");
      setTimeout(() => setToast(null), 2000);
      return;
    }
    if (!locked.items.length) {
      setToast("请选择服务");
      return;
    }
    setCalling(true);
    try {
      let chainOrderId: string | null = null;
      let chainDigest: string | null = null;
      if (isChainOrdersEnabled()) {
        chainOrderId = createChainOrderId();
        const chainResult = await createOrderOnChain({
          orderId: chainOrderId,
          serviceFee: locked.total,
          deposit: 0,
          autoPay: true,
        });
        chainDigest = chainResult.digest;
      }
      const result = await createOrder({
        id: chainOrderId || `${Date.now()}`,
        user: "安排页面",
        userAddress: chainAddress,
        item: locked.items.join("、"),
        amount: locked.total,
        status: "待派单",
        time: new Date().toISOString(),
        chainDigest: chainDigest || undefined,
        serviceFee: locked.service,
        serviceFeePaid: true,
        playerDue: locked.player,
        depositPaid: false,
        playerPaid: false,
        note: `来源：安排页呼叫服务。撮合费${(MATCH_RATE * 100).toFixed(0)}%已付`,
      });
      await refreshOrders();
      setMode("notifying");
      setFeeOpen(false);
      if (result.sent === false) {
        setToast(result.error || "订单已创建，通知失败");
      } else {
        setToast(chainDigest ? "已上链并派单" : "撮合费已记录，正在派单");
      }
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setTimeout(() => setToast(null), 3000);
      setCalling(false);
    }
  };

  return (
    <div className="ride-shell">
      {isChainOrdersEnabled() && (
        <div className="dl-card" style={{ marginBottom: 12 }}>
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-900">链上订单状态</div>
            <button className="dl-tab-btn" style={{ padding: "6px 10px" }} onClick={loadChain}>
              {chainLoading ? "刷新中..." : "刷新"}
            </button>
          </div>
          <div className="text-xs text-gray-500 mt-2">
            当前地址：{chainAddress ? `${chainAddress.slice(0, 6)}...${chainAddress.slice(-4)}` : "未登录"}
          </div>
          {chainError && <div className="mt-2 text-xs text-rose-500">{chainError}</div>}
          {chainToast && <div className="mt-2 text-xs text-emerald-600">{chainToast}</div>}
          {!chainCurrentOrder ? (
            <div className="mt-2 text-xs text-gray-500">暂无链上订单</div>
          ) : (
            <div className="mt-3 text-xs text-gray-600">
              <div>订单号：{chainCurrentOrder.orderId}</div>
              <div>状态：{statusLabel(chainCurrentOrder.status)}</div>
              <div>撮合费：¥{formatAmount(chainCurrentOrder.serviceFee)}</div>
              <div>押金：¥{formatAmount(chainCurrentOrder.deposit)}</div>
              <div>争议截止：{formatTime(chainCurrentOrder.disputeDeadline)}</div>
              <div className="mt-2 flex gap-2 flex-wrap">
                {chainCurrentOrder.status === 0 && (
                  <button
                    className="dl-tab-btn"
                    style={{ padding: "6px 10px" }}
                    disabled={chainAction === `pay-${chainCurrentOrder.orderId}`}
                    onClick={() =>
                      runChainAction(
                        `pay-${chainCurrentOrder.orderId}`,
                        () => payServiceFeeOnChain(chainCurrentOrder.orderId),
                        "撮合费已上链"
                      )
                    }
                  >
                    支付撮合费
                  </button>
                )}
                {(chainCurrentOrder.status === 0 || chainCurrentOrder.status === 1) && (
                  <button
                    className="dl-tab-btn"
                    style={{ padding: "6px 10px" }}
                    disabled={chainAction === `cancel-${chainCurrentOrder.orderId}`}
                    onClick={() =>
                      runChainAction(
                        `cancel-${chainCurrentOrder.orderId}`,
                        () => cancelOrderOnChain(chainCurrentOrder.orderId),
                        "订单已取消"
                      )
                    }
                  >
                    取消订单
                  </button>
                )}
                {chainCurrentOrder.status === 2 && (
                  <button
                    className="dl-tab-btn"
                    style={{ padding: "6px 10px" }}
                    disabled={chainAction === `complete-${chainCurrentOrder.orderId}`}
                    onClick={() =>
                      runChainAction(
                        `complete-${chainCurrentOrder.orderId}`,
                        () => markCompletedOnChain(chainCurrentOrder.orderId),
                        "已确认完成"
                      )
                    }
                  >
                    确认完成
                  </button>
                )}
                {chainCurrentOrder.status === 3 && (
                  <>
                    <button
                      className="dl-tab-btn"
                      style={{ padding: "6px 10px" }}
                      disabled={chainAction === `dispute-${chainCurrentOrder.orderId}`}
                      onClick={() => {
                        const evidence = window.prompt("请输入争议说明或证据哈希（可留空）") || "";
                        runChainAction(
                          `dispute-${chainCurrentOrder.orderId}`,
                          () => raiseDisputeOnChain(chainCurrentOrder.orderId, evidence),
                          "已提交争议"
                        );
                      }}
                    >
                      发起争议
                    </button>
                    <button
                      className="dl-tab-btn"
                      style={{ padding: "6px 10px" }}
                      disabled={chainAction === `finalize-${chainCurrentOrder.orderId}`}
                      onClick={() =>
                        runChainAction(
                          `finalize-${chainCurrentOrder.orderId}`,
                          () => finalizeNoDisputeOnChain(chainCurrentOrder.orderId),
                          "订单已结算"
                        )
                      }
                    >
                      无争议结算
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {feeOpen && (
        <div className="ride-modal-mask" role="dialog" aria-modal="true">
          <div className="ride-modal">
            <div className="ride-modal-head">
              <div>
                <div className="ride-modal-title">支付平台撮合费</div>
                <div className="ride-modal-sub">按订单金额 15% 计算，支付后开始呼叫</div>
              </div>
              <div className="ride-modal-amount">¥{locked.service.toFixed(2)}</div>
            </div>
            <div className="ride-qr-inline">
              <div className="ride-qr-img">
                <img src={platformQr} alt="平台撮合费收款码" />
              </div>
              <div className="ride-qr-text">
                <div className="text-sm font-semibold text-gray-900">平台撮合费</div>
                <div className="text-xs text-gray-500">订单 ¥{locked.total.toFixed(2)} × 15% = ¥{locked.service.toFixed(2)}</div>
                <div className="ride-chip">撮合费不抵扣打手费用</div>
                <label className="ride-status-toggle" style={{ marginTop: 10 }}>
                  <input
                    type="checkbox"
                    checked={feeChecked}
                    onChange={(e) => setFeeChecked(e.target.checked)}
                    aria-label="已支付撮合费"
                  />
                  <span>我已支付</span>
                  {feeChecked && <CheckCircle2 size={16} color="#22c55e" />}
                </label>
              </div>
            </div>
            <div className="ride-modal-actions">
              <button className="dl-tab-btn" onClick={() => setFeeOpen(false)}>
                取消
              </button>
              <button
                className="dl-tab-btn"
                style={{ background: "#0f172a", color: "#fff" }}
                onClick={callOrder}
                disabled={calling}
              >
                {calling ? <Loader2 size={16} className="spin" /> : null}
                <span style={{ marginLeft: calling ? 6 : 0 }}>支付完成，开始派单</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="ride-tip" style={{ marginTop: 0 }}>
        本单含多种特惠计价，点击查看详情
      </div>

      <div className="ride-content">
        <div className="ride-side">
          {sections.map((s) => (
            <button
              key={s.title}
              className={`ride-side-tab ${active === s.title ? "is-active" : ""}`}
              onClick={() => {
                setActive(s.title);
                sectionRefs.current[s.title]?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              {s.title}
            </button>
          ))}
        </div>

        <div className="ride-main">
          <div className="ride-sections">
            {sections.map((section) => (
              <div
                key={section.title}
                ref={(el) => {
                  sectionRefs.current[section.title] = el;
                }}
                className={`ride-block ${section.highlight ? "is-highlight" : ""}`}
              >
                <div className="ride-block-title">
                  <span>{section.title}</span>
                  {section.badge && <span className="ride-badge">{section.badge}</span>}
                </div>
                <div className="ride-items">
                  {section.items.map((item) => (
                    <div key={item.name} className="ride-row">
                      <div className="ride-row-main">
                        <div className="ride-row-title">
                          {item.name}
                          {item.tag && <span className="ride-tag">{item.tag}</span>}
                        </div>
                        <div className="ride-row-desc">{item.desc}</div>
                        <div className="ride-row-eta">
                          <Clock3 size={14} />
                          <span>{item.eta}</span>
                        </div>
                      </div>
                      <div className="ride-row-side">
                        <div className="ride-row-price">
                          <span className={item.bold ? "bold" : ""}>{item.price}</span>
                          {item.old && <span className="ride-old">{item.old}</span>}
                        </div>
                        {item.info && (
                          <div className="ride-info">
                            <button
                              type="button"
                              className="ride-info-dot"
                              onClick={() => setInfoOpen((prev) => (prev === item.name ? null : item.name))}
                              onMouseEnter={() => setInfoOpen(item.name)}
                              onMouseLeave={() => setInfoOpen(null)}
                              aria-label={item.info}
                            >
                              !
                            </button>
                            {infoOpen === item.name && <div className="ride-tooltip">{item.info}</div>}
                          </div>
                        )}
                        <label className="ride-checkbox">
                          <input type="checkbox" checked={!!checked[item.name]} onChange={() => toggle(item.name)} />
                          <span className="ride-checkbox-box" />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <footer className="ride-footer">
        <div className="ride-footer-left">
          <div className="ride-range">预估价 {pickedPrice ? pickedPrice.toFixed(0) : "4-9"}</div>
          <div className="ride-extra">动态调价</div>
        </div>
        <button className="ride-call" onClick={submit}>
          <QrCode size={16} style={{ marginRight: 6 }} />
          先付撮合费再呼叫
        </button>
      </footer>
      {toast && <div className="ride-toast">{toast}</div>}
    </div>
  );
}

function deriveMode(list: LocalOrder[]): Mode {
  const latest = list.find((o) => o.status !== "取消") || null;
  if (!latest) return "select";
  if (latest.driver) {
    return latest.playerPaid ? "enroute" : "await-user-pay";
  }
  return "notifying";
}

function Step({ label, done }: { label: string; done?: boolean }) {
  return (
    <div className={`ride-step ${done ? "is-done" : ""}`}>
      <div className="ride-step-icon">{done ? <ShieldCheck size={16} /> : <Loader2 size={16} className="spin" />}</div>
      <div className="ride-step-text">{label}</div>
    </div>
  );
}
