"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clock3, ShieldCheck, QrCode, Loader2, CheckCircle2 } from "lucide-react";
import { type LocalOrder } from "@/app/components/order-store";
import { createOrder, deleteOrder, fetchOrders, patchOrder, syncChainOrder } from "@/app/components/order-service";
import { readCache, writeCache } from "@/app/components/client-cache";
import { trackEvent } from "@/app/components/analytics";
import {
  type ChainOrder,
  cancelOrderOnChain,
  createChainOrderId,
  createOrderOnChain,
  fetchChainOrders,
  finalizeNoDisputeOnChain,
  getCurrentAddress,
  getChainDebugInfo,
  isChainOrdersEnabled,
  isVisualTestMode,
  markCompletedOnChain,
  payServiceFeeOnChain,
  raiseDisputeOnChain,
} from "@/lib/qy-chain";
import { resolveDisputePolicy } from "@/lib/risk-policy";
import { StateBlock } from "@/app/components/state-block";

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

type Mode = "select" | "notifying" | "await-user-pay" | "enroute" | "pending-settlement";

type PublicPlayer = {
  id: string;
  name: string;
  role?: string;
  status: "可接单" | "忙碌" | "停用";
  wechatQr?: string;
  alipayQr?: string;
};

const GAME_PROFILE_KEY = "qy_game_profile_v1";
const FIRST_ORDER_STORAGE_KEY = "qy_first_order_discount_used_v1";
const FIRST_ORDER_DISCOUNT = { minSpend: 99, amount: 10, label: "首单满99减10" };

type GameProfile = {
  gameName: string;
  gameId: string;
  updatedAt: number;
  userAddress?: string;
};

type StoredProfiles = Record<string, GameProfile>;

function loadGameProfile(address: string) {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(GAME_PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredProfiles;
    return parsed[address] || parsed.local || null;
  } catch {
    return null;
  }
}

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

const PLAYER_SECTION_TITLE = "可接打手";

function readDiscountUsage(address: string) {
  if (typeof window === "undefined") return false;
  const key = address || "guest";
  const raw = window.localStorage.getItem(FIRST_ORDER_STORAGE_KEY);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return Boolean(parsed[key]);
  } catch {
    return false;
  }
}

function markDiscountUsage(address: string) {
  if (typeof window === "undefined") return;
  const key = address || "guest";
  const raw = window.localStorage.getItem(FIRST_ORDER_STORAGE_KEY);
  const next: Record<string, boolean> = {};
  if (raw) {
    try {
      Object.assign(next, JSON.parse(raw) as Record<string, boolean>);
    } catch {
      // ignore
    }
  }
  next[key] = true;
  window.localStorage.setItem(FIRST_ORDER_STORAGE_KEY, JSON.stringify(next));
}

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
  const [diamondBalance, setDiamondBalance] = useState<string>("0");
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceReady, setBalanceReady] = useState(false);
  const [vipTier, setVipTier] = useState<{ level?: number; name?: string } | null>(null);
  const [vipLoading, setVipLoading] = useState(false);
  const [firstOrderEligible, setFirstOrderEligible] = useState(false);
  const [locked, setLocked] = useState<{
    total: number;
    originalTotal: number;
    discount: number;
    service: number;
    player: number;
    items: string[];
  }>({
    total: 0,
    originalTotal: 0,
    discount: 0,
    service: 0,
    player: 0,
    items: [],
  });
  const [calling, setCalling] = useState(false);
  const [chainOrders, setChainOrders] = useState<ChainOrder[]>([]);
  const [chainLoading, setChainLoading] = useState(false);
  const [chainError, setChainError] = useState<string | null>(null);
  const [chainToast, setChainToast] = useState<string | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [chainAction, setChainAction] = useState<string | null>(null);
  const [chainAddress, setChainAddress] = useState("");
  const [chainUpdatedAt, setChainUpdatedAt] = useState<number | null>(null);
  const redirectRef = useRef(false);
  const [players, setPlayers] = useState<PublicPlayer[]>([]);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [playersError, setPlayersError] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>("");
  const [userAddress, setUserAddress] = useState(() => getCurrentAddress());
  const cacheTtlMs = 60_000;

  const MATCH_RATE = 0.15;

  const refreshOrders = useCallback(async (addrOverride?: string) => {
    const list = await fetchOrders({ force: true });
    const addr = addrOverride ?? userAddress ?? getCurrentAddress();
    const filtered = list.filter((order) => {
      if (!addr) return true;
      if (!order.userAddress) return false;
      return order.userAddress === addr;
    });
    setOrders(filtered);
    setMode(deriveMode(filtered));
  }, [userAddress]);

  useEffect(() => {
    refreshOrders();
  }, [refreshOrders]);

  useEffect(() => {
    const sync = () => {
      const addr = getCurrentAddress();
      setUserAddress(addr);
      refreshOrders(addr);
    };
    sync();
    window.addEventListener("passkey-updated", sync);
    return () => window.removeEventListener("passkey-updated", sync);
  }, [refreshOrders]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      refreshOrders(userAddress || getCurrentAddress());
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [refreshOrders, userAddress]);

  useEffect(() => {
    const addr = userAddress || getCurrentAddress();
    const used = readDiscountUsage(addr);
    const eligibleList = addr
      ? orders.filter((order) => order.userAddress === addr)
      : orders;
    setFirstOrderEligible(!used && eligibleList.length === 0);
  }, [orders, userAddress]);

  const refreshVip = async () => {
    const addr = getCurrentAddress();
    if (!addr) {
      setVipTier(null);
      return;
    }
    const vipCacheKey = `cache:vip:status:${addr}`;
    const cachedVip = readCache<{ tier?: { level?: number; name?: string } }>(vipCacheKey, cacheTtlMs, true);
    if (cachedVip?.value?.tier) {
      setVipTier({ level: cachedVip.value.tier.level, name: cachedVip.value.tier.name });
    }
    setVipLoading(true);
    try {
      const res = await fetch(`/api/vip/status?userAddress=${addr}`);
      const data = await res.json();
      if (data?.tier) {
        setVipTier({ level: data.tier.level, name: data.tier.name });
        writeCache(vipCacheKey, { tier: data.tier });
      } else {
        setVipTier(null);
        writeCache(vipCacheKey, { tier: null });
      }
    } catch {
      // ignore vip errors
    } finally {
      setVipLoading(false);
    }
  };

  useEffect(() => {
    refreshVip();
    const handle = () => refreshVip();
    window.addEventListener("passkey-updated", handle);
    return () => window.removeEventListener("passkey-updated", handle);
  }, []);

  const fetchOrSyncChainOrder = async (orderId: string) => {
    // 第一步：尝试从本地链上订单列表查找
    let list = await fetchChainOrders();
    let found = list.find((order) => order.orderId === orderId) || null;
    if (found) {
      setChainOrders(list);
      return found;
    }

    // 第二步：同步到服务端查询（服务端会自动重试3次，共等待3秒）
    try {
      await syncChainOrder(orderId, chainAddress || undefined);

      // 第三步：重新获取链上订单列表
      list = await fetchChainOrders();
      setChainOrders(list);
      found = list.find((order) => order.orderId === orderId) || null;
      if (found) return found;

      // 第四步：如果还是找不到，等待1秒后再试一次（应对极端延迟）
      await new Promise((resolve) => setTimeout(resolve, 1000));
      list = await fetchChainOrders();
      setChainOrders(list);
      found = list.find((order) => order.orderId === orderId) || null;
      if (found) return found;
    } catch (error) {
      const errorMsg = (error as Error).message || "链上订单同步失败";
      // 如果是 chain order not found 错误，提供更友好的提示
      if (errorMsg.includes("not found") || errorMsg.includes("未找到")) {
        throw new Error("链上订单暂未索引完成，请稍后再试（通常需要等待3-10秒）");
      }
      throw new Error(errorMsg);
    }
    throw new Error("链上订单未找到，可能索引延迟较大，请稍后重试");
  };

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
      setChainError((e as Error).message || "链上订单加载失败，请检查链上配置");
    } finally {
      if (!visualTest) {
        setChainLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!isChainOrdersEnabled()) return;
    loadChain();
  }, [loadChain]);

  const loadPlayers = async () => {
    setPlayersLoading(true);
    setPlayersError(null);
    const cacheKey = "cache:players:public";
    const cached = readCache<PublicPlayer[]>(cacheKey, cacheTtlMs, true);
    if (cached) {
      setPlayers(Array.isArray(cached.value) ? cached.value : []);
    }
    try {
      const res = await fetch("/api/players");
      if (!res.ok) {
        throw new Error("加载失败");
      }
      const data = await res.json();
      const next = Array.isArray(data) ? data : [];
      setPlayers(next);
      writeCache(cacheKey, next);
    } catch (e) {
      setPlayersError((e as Error).message || "加载打手失败");
    } finally {
      setPlayersLoading(false);
    }
  };

  useEffect(() => {
    loadPlayers();
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

  const currentOrder = useMemo(() => {
    const list = orders;
    return list.find((o) => !o.status.includes("取消") && !o.status.includes("完成")) || null;
  }, [orders]);
  const chainCurrentOrder = useMemo(() => {
    const addr = chainAddress;
    const list = addr
      ? chainOrders.filter((o) => o.user === addr)
      : chainOrders;
    const active = list.filter((o) => o.status !== 6);
    return active.length > 0 ? active[0] : null;
  }, [chainOrders, chainAddress]);

  const selectedPlayer = useMemo(
    () => players.find((player) => player.id === selectedPlayerId) || null,
    [players, selectedPlayerId]
  );

  const playerDue = useMemo(() => {
    if (!currentOrder) return 0;
    if (typeof currentOrder.playerDue === "number") return currentOrder.playerDue;
    const fee = currentOrder.serviceFee ?? Number((currentOrder.amount * MATCH_RATE).toFixed(2));
    return Math.max(Number((currentOrder.amount - fee).toFixed(2)), 0);
  }, [currentOrder]);
  const escrowFeeDisplay = currentOrder ? currentOrder.amount : locked.total;

  const cancelOrder = async () => {
    if (!currentOrder) return;
    const meta = (currentOrder.meta || {}) as Record<string, unknown>;
    const isChainOrder = Boolean(currentOrder.chainDigest || meta.chain);
    if (isChainOrder) {
      const chainOrder =
        chainCurrentOrder && chainCurrentOrder.orderId === currentOrder.id ? chainCurrentOrder : null;
      if (chainOrder && chainOrder.status >= 2) {
        setToast("押金已锁定，无法取消，请走争议/客服处理");
        setTimeout(() => setToast(null), 3000);
        return;
      }
      const ok = await runChainAction(
        `cancel-${currentOrder.id}`,
        () => cancelOrderOnChain(currentOrder.id),
        "订单已取消，托管费已退回",
        currentOrder.id
      );
      if (!ok) return;
      setMode("select");
      return;
    }
    await deleteOrder(currentOrder.id, getCurrentAddress());
    await refreshOrders();
    setMode("select");
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

  useEffect(() => {
    if (!chainCurrentOrder) return;
    if (!currentOrder || currentOrder.id !== chainCurrentOrder.orderId) return;
    const patch: Partial<LocalOrder> = {};
    if (chainCurrentOrder.status >= 1) patch.serviceFeePaid = true;
    if (chainCurrentOrder.status >= 2) patch.depositPaid = true;
    if (Object.keys(patch).length > 0) {
      patchOrder(currentOrder.id, { ...patch, userAddress: getCurrentAddress() });
      refreshOrders();
    }
  }, [chainCurrentOrder, currentOrder, refreshOrders]);

  const submit = () => {
    if (pickedNames.length === 0) {
      setToast("请先选择服务");
      return;
    }
    const originalTotal = pickedPrice || Math.max(pickedNames.length * 10, 10);
    const canDiscount = firstOrderEligible && originalTotal >= FIRST_ORDER_DISCOUNT.minSpend;
    const discount = canDiscount ? FIRST_ORDER_DISCOUNT.amount : 0;
    const total = Math.max(originalTotal - discount, 0);
    const service = Number((total * MATCH_RATE).toFixed(2));
    const player = Math.max(Number((total - service).toFixed(2)), 0);
    setLocked({ total, originalTotal, discount, service, player, items: pickedNames });
    trackEvent("order_intent", {
      source: "schedule",
      itemsCount: pickedNames.length,
      originalTotal,
      total,
      discount,
      eligible: firstOrderEligible,
    });
    setFeeOpen(true);
    setFeeChecked(false);
  };

  const diamondRate = 10;
  const requiredDiamonds = Math.ceil(locked.total * diamondRate);
  const hasEnoughDiamonds = Number(diamondBalance) >= requiredDiamonds;
  const disputePolicy = useMemo(() => resolveDisputePolicy(vipTier?.level), [vipTier]);

  const refreshBalance = async () => {
    const addr = getCurrentAddress();
    if (!addr) return;
    const cacheKey = `cache:diamond-balance:${addr}`;
    const cached = readCache<string>(cacheKey, cacheTtlMs, true);
    if (cached) {
      setDiamondBalance(cached.value);
    }
    setBalanceLoading(true);
    setBalanceReady(false);
    try {
      const res = await fetch(`/api/ledger/balance?address=${addr}`);
      const data = await res.json();
      if (data?.balance !== undefined) {
        const next = String(data.balance);
        setDiamondBalance(next);
        writeCache(cacheKey, next);
        setBalanceReady(true);
      }
    } catch {
      // ignore balance errors
    } finally {
      setBalanceLoading(false);
    }
  };

  useEffect(() => {
    if (feeOpen) {
      redirectRef.current = false;
      setBalanceReady(false);
      refreshBalance();
      refreshVip();
    }
  }, [feeOpen]);

  useEffect(() => {
    if (!feeOpen) return;
    if (balanceLoading) return;
    if (!balanceReady) return;
    const addr = getCurrentAddress();
    if (!addr) {
      setToast("请先登录账号以便扣减钻石");
      return;
    }
    if (!hasEnoughDiamonds && !redirectRef.current) {
      redirectRef.current = true;
      setToast("钻石余额不足，正在跳转充值...");
      setTimeout(() => {
        window.location.href = "/wallet";
      }, 1200);
    }
  }, [feeOpen, balanceLoading, balanceReady, hasEnoughDiamonds]);

  if (mode === "await-user-pay" && currentOrder?.driver) {
    const companionProfile = (currentOrder.meta?.companionProfile || null) as
      | { gameName?: string; gameId?: string }
      | null;
    const hasCompanionProfile = Boolean(companionProfile?.gameName || companionProfile?.gameId);
    const paymentMode = (currentOrder.meta as { paymentMode?: string } | undefined)?.paymentMode;
    const isEscrow = paymentMode === "diamond_escrow";
    return (
      <div className="ride-shell">
        <div className="ride-tip" style={{ marginTop: 0 }}>
          打手已支付押金，平台将使用钻石托管打手费用
        </div>

        <div className="ride-driver-card dl-card">
          <div className="flex items-center gap-3">
            <div className="ride-driver-avatar" />
            <div>
              <div className="text-sm text-amber-600 font-semibold">
                {isEscrow ? "打手费用已托管" : "等待支付打手费用"}
              </div>
              {hasCompanionProfile ? (
                <>
                  <div className="text-lg font-bold text-gray-900">陪玩游戏设置</div>
                  <div className="text-xs text-gray-500">
                    游戏名 {companionProfile?.gameName || "-"} · ID {companionProfile?.gameId || "-"}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-lg font-bold text-gray-900">{currentOrder.driver.name}</div>
                  <div className="text-xs text-gray-500">{currentOrder.driver.car}</div>
                </>
              )}
            </div>
            <div className="ml-auto text-right">
              {hasCompanionProfile ? (
                <>
                  <div className="text-emerald-600 font-semibold text-sm">已接单</div>
                  <div className="text-xs text-gray-500">请确认游戏信息</div>
                </>
              ) : (
                <>
                  <div className="text-emerald-600 font-semibold text-sm">{currentOrder.driver.eta}</div>
                  {currentOrder.driver.price && (
                    <div className="text-xs text-gray-500">一口价 ¥{currentOrder.driver.price / 10}</div>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="ride-driver-actions">
            <button className="dl-tab-btn" onClick={cancelOrder}>取消订单</button>
            <button className="dl-tab-btn" style={{ background: "#f97316", color: "#fff" }}>
              联系打手
            </button>
          </div>
          <div className="text-xs text-gray-500 mt-2">订单：{currentOrder.item}</div>
        </div>

        <div className="ride-pay-box">
          <div className="ride-pay-head">
            <div>
              <div className="ride-pay-title">托管打手费用</div>
              <div className="ride-pay-sub">无需扫码，平台将从钻石托管后结算</div>
            </div>
            <div className="ride-pay-amount">¥{playerDue.toFixed(2)}</div>
          </div>
          <div className="ride-pay-actions">
            <button className="dl-tab-btn" onClick={cancelOrder}>取消订单</button>
            <button
              className="dl-tab-btn"
              style={{ background: "#0f172a", color: "#fff" }}
              onClick={async () => {
                if (!currentOrder) return;
                await patchOrder(currentOrder.id, { playerPaid: true, status: "打手费已托管", userAddress: getCurrentAddress() });
                await refreshOrders();
                setMode("enroute");
              }}
            >
              进入服务
            </button>
          </div>
        </div>
        {toast && <div className="ride-toast">{toast}</div>}
      </div>
    );
  }

  if (mode === "enroute" && currentOrder?.driver) {
    const companionProfile = (currentOrder.meta?.companionProfile || null) as
      | { gameName?: string; gameId?: string }
      | null;
    const hasCompanionProfile = Boolean(companionProfile?.gameName || companionProfile?.gameId);
    const companionEndedAt = (currentOrder.meta as { companionEndedAt?: number | string } | undefined)?.companionEndedAt;
    const canConfirmCompletion = Boolean(companionEndedAt);
    return (
      <div className="ride-shell">
        <div className="ride-map-large">
          <StateBlock tone="loading" size="compact" align="center" title="地图加载中" description="正在定位服务区域" />
        </div>
        {canConfirmCompletion && (
          <div className="ride-tip" style={{ marginTop: 0 }}>
            打手已结束服务，请确认完成后进入结算/争议期
          </div>
        )}
        <div className="ride-driver-card dl-card">
          <div className="flex items-center gap-3">
            <div className="ride-driver-avatar" />
            <div>
              <div className="text-sm text-amber-600 font-semibold">服务已开始</div>
              {hasCompanionProfile ? (
                <>
                  <div className="text-lg font-bold text-gray-900">陪玩游戏设置</div>
                  <div className="text-xs text-gray-500">
                    游戏名 {companionProfile?.gameName || "-"} · ID {companionProfile?.gameId || "-"}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-lg font-bold text-gray-900">{currentOrder.driver.name}</div>
                  <div className="text-xs text-gray-500">{currentOrder.driver.car}</div>
                </>
              )}
            </div>
            <div className="ml-auto text-right">
              {hasCompanionProfile ? (
                <>
                  <div className="text-emerald-600 font-semibold text-sm">服务已开始</div>
                  <div className="text-xs text-gray-500">请保持在线</div>
                </>
              ) : (
                <>
                  <div className="text-emerald-600 font-semibold text-sm">{currentOrder.driver.eta}</div>
                  {currentOrder.driver.price && (
                    <div className="text-xs text-gray-500">一口价 ¥{currentOrder.driver.price / 10}</div>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="ride-driver-actions">
            <button className="dl-tab-btn" onClick={cancelOrder}>取消订单</button>
            <button className="dl-tab-btn">安全中心</button>
            {canConfirmCompletion && (
              <button
                className="dl-tab-btn"
                onClick={async () => {
                  if (!currentOrder) return;
                  const meta = (currentOrder.meta || {}) as Record<string, unknown>;
                  const isChainOrder = Boolean(currentOrder.chainDigest || meta.chain);
                  if (isChainOrder) {
                    let chainOrder = chainOrders.find((order) => order.orderId === currentOrder.id) || null;
                    if (!chainOrder) {
                      try {
                        chainOrder = await fetchOrSyncChainOrder(currentOrder.id);
                      } catch (error) {
                        setToast((error as Error).message || "链上订单加载失败，请检查链上配置");
                        return;
                      }
                    }
                    if (!chainOrder) {
                      setToast("链上订单未同步（已尝试服务端刷新）");
                      return;
                    }
                    if (chainOrder.status !== 2) {
                      setToast("当前状态无法确认完成");
                      return;
                    }
                    await runChainAction(
                      `complete-${currentOrder.id}`,
                      () => markCompletedOnChain(currentOrder.id),
                      "已确认完成",
                      currentOrder.id
                    );
                    return;
                  }
                  await patchOrder(currentOrder.id, { status: "待结算", userAddress: getCurrentAddress() });
                  await refreshOrders();
                  setMode("pending-settlement");
                }}
              >
                确认完成
              </button>
            )}
            <button className="dl-tab-btn" style={{ background: "#f97316", color: "#fff" }}>
              联系打手
            </button>
          </div>
          <div className="text-xs text-gray-500 mt-2">订单：{currentOrder.item}</div>
        </div>
        {toast && <div className="ride-toast">{toast}</div>}
      </div>
    );
  }

  if (mode === "pending-settlement" && currentOrder?.driver) {
    const companionProfile = (currentOrder.meta?.companionProfile || null) as
      | { gameName?: string; gameId?: string }
      | null;
    const hasCompanionProfile = Boolean(companionProfile?.gameName || companionProfile?.gameId);
    const chainOrder =
      currentOrder && chainOrders.length > 0
        ? chainOrders.find((order) => order.orderId === currentOrder.id) || null
        : null;
    const canSettle = Boolean(chainOrder && chainOrder.status === 3);
    return (
      <div className="ride-shell">
        <div className="ride-map-large">
          <StateBlock tone="loading" size="compact" align="center" title="地图加载中" description="正在定位服务区域" />
        </div>
        <div className="ride-driver-card dl-card">
          <div className="flex items-center gap-3">
            <div className="ride-driver-avatar" />
            <div>
              <div className="text-sm text-amber-600 font-semibold">服务已完成</div>
              {hasCompanionProfile ? (
                <>
                  <div className="text-lg font-bold text-gray-900">陪玩游戏设置</div>
                  <div className="text-xs text-gray-500">
                    游戏名 {companionProfile?.gameName || "-"} · ID {companionProfile?.gameId || "-"}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-lg font-bold text-gray-900">{currentOrder.driver.name}</div>
                  <div className="text-xs text-gray-500">{currentOrder.driver.car}</div>
                </>
              )}
            </div>
            <div className="ml-auto text-right">
              <div className="text-emerald-600 font-semibold text-sm">待结算</div>
              <div className="text-xs text-gray-500">可发起争议</div>
            </div>
          </div>
          <div className="ride-driver-actions">
            <button
              className="dl-tab-btn"
              onClick={() => {
                if (!canSettle || !currentOrder) {
                  setToast("当前状态无法发起争议");
                  return;
                }
                const evidence = window.prompt("请输入争议说明或证据哈希（可留空）") || "";
                runChainAction(
                  `dispute-${currentOrder.id}`,
                  () => raiseDisputeOnChain(currentOrder.id, evidence),
                  "已提交争议",
                  currentOrder.id
                );
              }}
            >
              发起争议
            </button>
            <button
              className="dl-tab-btn"
              style={{ background: "#0f172a", color: "#fff" }}
              onClick={() => {
                if (!canSettle || !currentOrder) {
                  setToast("当前状态无法结算");
                  return;
                }
                runChainAction(
                  `finalize-${currentOrder.id}`,
                  () => finalizeNoDisputeOnChain(currentOrder.id),
                  "订单已结算",
                  currentOrder.id
                );
              }}
            >
              无争议结算
            </button>
            <button className="dl-tab-btn" style={{ background: "#f97316", color: "#fff" }}>
              联系打手
            </button>
          </div>
          <div className="text-xs text-gray-500 mt-2">订单：{currentOrder.item}</div>
        </div>
        {toast && <div className="ride-toast">{toast}</div>}
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
          <Step label={`托管费 ¥${escrowFeeDisplay.toFixed(2)} 已收`} done={!!currentOrder.serviceFeePaid} />
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
          <div className="text-xs text-gray-500 mt-3">押金未付前不会进入服务阶段，费用已由钻石托管。</div>
        </div>
      </div>
    );
  }

  const callOrder = async () => {
    if (!feeChecked) {
      setToast("请先确认使用钻石托管费用");
      setTimeout(() => setToast(null), 2000);
      return;
    }
    if (!locked.items.length) {
      setToast("请选择服务");
      return;
    }
    setCalling(true);
    try {
      const requestedNote = selectedPlayer ? `指定打手：${selectedPlayer.name}` : "";
      let chainOrderId: string | null = null;
      let chainDigest: string | null = null;
      if (isChainOrdersEnabled()) {
        const addr = getCurrentAddress();
        if (!addr) {
          throw new Error("请先登录账号以便扣减钻石");
        }
        if (!hasEnoughDiamonds) {
          throw new Error("钻石余额不足");
        }
        chainOrderId = createChainOrderId();
        const chainResult = await createOrderOnChain({
          orderId: chainOrderId,
          serviceFee: requiredDiamonds,
          deposit: 0,
          ruleSetId: disputePolicy.ruleSetId,
          autoPay: true,
          rawAmount: true,
        });
        chainDigest = chainResult.digest;
      }
      const gameProfile = loadGameProfile(getCurrentAddress());
      const result = await createOrder({
        id: chainOrderId || `${Date.now()}`,
        user: "安排页面",
        userAddress: getCurrentAddress(),
        item: locked.items.join("、"),
        amount: locked.total,
        status: "待派单",
        time: new Date().toISOString(),
        chainDigest: chainDigest || undefined,
        serviceFee: locked.service,
        serviceFeePaid: true,
        playerDue: locked.player,
        depositPaid: false,
        playerPaid: true,
        note: [
          `来源：安排页呼叫服务。托管费用使用钻石支付(${requiredDiamonds}钻石)`,
          locked.discount > 0 ? `首单优惠减免 ¥${locked.discount}` : "",
          requestedNote,
        ]
          .filter(Boolean)
          .join("；"),
        meta: {
          disputeWindowHours: disputePolicy.hours,
          ruleSetId: disputePolicy.ruleSetId,
          vipTier: vipTier?.name || null,
          vipLevel: vipTier?.level ?? null,
          paymentMode: "diamond_escrow",
          diamondCharge: requiredDiamonds,
          diamondChargeCny: locked.total,
          firstOrderDiscount:
            locked.discount > 0
              ? {
                  amount: locked.discount,
                  minSpend: FIRST_ORDER_DISCOUNT.minSpend,
                  originalTotal: locked.originalTotal,
                }
              : null,
          requestedPlayerId: selectedPlayer?.id || null,
          requestedPlayerName: selectedPlayer?.name || null,
          requestedPlayerRole: selectedPlayer?.role || null,
          publicPool: true,
          gameProfile: gameProfile
            ? {
                gameName: gameProfile.gameName,
                gameId: gameProfile.gameId,
                updatedAt: gameProfile.updatedAt,
              }
            : null,
        },
      });
      await refreshOrders();
      if (locked.discount > 0) {
        markDiscountUsage(getCurrentAddress());
        trackEvent("first_order_discount_applied", {
          orderId: result.orderId,
          discount: locked.discount,
          originalTotal: locked.originalTotal,
        });
      }
      trackEvent("order_create_success", {
        orderId: result.orderId,
        total: locked.total,
        discount: locked.discount,
        paymentMode: "diamond_escrow",
        chain: Boolean(chainDigest),
      });
      setMode("notifying");
      setFeeOpen(false);
      if (result.sent === false) {
        setToast(result.error || "订单已创建，通知失败");
      } else {
        setToast(chainDigest ? "已提交并派单" : "托管费用已记录，正在派单");
      }
    } catch (e) {
      const message = (e as Error).message || "创建订单失败";
      trackEvent("order_create_failed", {
        error: message,
        total: locked.total,
        discount: locked.discount,
      });
      setToast(message);
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
            <div className="text-sm font-semibold text-gray-900">订单状态</div>
            <button
              className="dl-tab-btn"
              style={{ padding: "6px 10px" }}
              onClick={loadChain}
              disabled={chainLoading}
            >
              {chainLoading ? "刷新中..." : "刷新"}
            </button>
          </div>
          <div className="text-xs text-gray-500 mt-2">
            当前账号：{chainAddress ? "已登录" : "未登录"}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            上次刷新：{chainUpdatedAt ? new Date(chainUpdatedAt).toLocaleTimeString() : "-"}
          </div>
          <div className="mt-2 flex justify-end">
            <button className="dl-tab-btn" style={{ padding: "6px 10px" }} onClick={() => setDebugOpen(true)}>
              链上调试信息
            </button>
          </div>
          {chainError && <div className="mt-2 text-xs text-rose-500">{chainError}</div>}
          {chainToast && <div className="mt-2 text-xs text-emerald-600">{chainToast}</div>}
          {!chainCurrentOrder ? (
            <StateBlock
              tone={chainLoading ? "loading" : chainError ? "danger" : "empty"}
              size="compact"
              title={chainLoading ? "同步中" : chainError ? "加载失败" : "暂无订单"}
              description={chainLoading ? "正在刷新链上订单" : chainError || "点击刷新获取最新状态"}
              actions={
                chainLoading ? null : (
                  <button className="dl-tab-btn" onClick={loadChain} disabled={chainLoading}>
                    刷新
                  </button>
                )
              }
            />
          ) : (
            <div className="mt-3 text-xs text-gray-600">
              <div>订单号：{chainCurrentOrder.orderId}</div>
              <div>状态：{statusLabel(chainCurrentOrder.status)}</div>
              <div>托管费：¥{formatAmount(chainCurrentOrder.serviceFee)}</div>
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
                        "托管费已提交",
                        chainCurrentOrder.orderId
                      )
                    }
                  >
                    支付托管费
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
                        "订单已取消",
                        chainCurrentOrder.orderId
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
                        "已确认完成",
                        chainCurrentOrder.orderId
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
                          "已提交争议",
                          chainCurrentOrder.orderId
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
                          "订单已结算",
                          chainCurrentOrder.orderId
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
                <div className="ride-modal-title">使用钻石托管费用</div>
                <div className="ride-modal-sub">按订单金额计算，1元=10钻石</div>
              </div>
              <div className="ride-modal-amount">{requiredDiamonds} 钻石</div>
            </div>
            <div className="ride-qr-inline">
              <div className="ride-qr-text">
                <div className="text-sm font-semibold text-gray-900">托管费用（钻石）</div>
                <div className="text-xs text-gray-500">
                  订单 ¥{locked.total.toFixed(2)} × {diamondRate} = {requiredDiamonds} 钻石
                </div>
                {locked.discount > 0 && (
                  <div className="ride-price-stack">
                    <div className="ride-price-line">
                      <span>原价</span>
                      <span>¥{locked.originalTotal.toFixed(2)}</span>
                    </div>
                    <div className="ride-price-line discount">
                      <span>{FIRST_ORDER_DISCOUNT.label}</span>
                      <span>-¥{locked.discount.toFixed(2)}</span>
                    </div>
                    <div className="ride-price-line total">
                      <span>应付</span>
                      <span>¥{locked.total.toFixed(2)}</span>
                    </div>
                  </div>
                )}
                <div className="text-xs text-gray-500" style={{ marginTop: 4 }}>
                  撮合费 ¥{locked.service.toFixed(2)} / 打手费用 ¥{locked.player.toFixed(2)}
                </div>
                <div className="ride-chip">打手费用由平台托管，服务完成后结算</div>
                <div className="text-xs text-gray-500" style={{ marginTop: 4 }}>
                  仲裁时效：{vipLoading ? "查询中..." : `${disputePolicy.hours}小时`}
                  {vipTier?.name ? `（会员：${vipTier.name}）` : ""}
                </div>
                <div className="text-xs text-gray-500" style={{ marginTop: 4 }}>
                  已选打手：
                  {selectedPlayer ? `${selectedPlayer.name}${selectedPlayer.role ? `（${selectedPlayer.role}）` : ""}` : "系统匹配"}
                </div>
                <div className="text-xs text-gray-500" style={{ marginTop: 6 }}>
                  当前余额：
                  {balanceLoading ? "查询中..." : balanceReady ? `${diamondBalance} 钻石` : "查询失败，请刷新"}
                </div>
                {balanceReady && !hasEnoughDiamonds && (
                  <div className="text-xs text-rose-500" style={{ marginTop: 4 }}>
                    钻石余额不足，请先充值
                  </div>
                )}
                <button className="dl-tab-btn" style={{ marginTop: 8 }} onClick={refreshBalance}>
                  刷新余额
                </button>
                <label className="ride-status-toggle" style={{ marginTop: 10 }}>
                  <input
                    type="checkbox"
                    checked={feeChecked}
                    onChange={(e) => setFeeChecked(e.target.checked)}
                    aria-label="已确认托管费用"
                  />
                  <span>使用钻石托管费用</span>
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
                disabled={calling || !hasEnoughDiamonds}
              >
                {calling ? <Loader2 size={16} className="spin" /> : null}
                <span style={{ marginLeft: calling ? 6 : 0 }}>扣减钻石并派单</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {debugOpen && (
        <div className="ride-modal-mask" role="dialog" aria-modal="true" aria-label="链上调试信息">
          <div className="ride-modal">
            <div className="ride-modal-head">
              <div>
                <div className="ride-modal-title">链上调试信息</div>
                <div className="ride-modal-sub">用于排查未同步、链上配置不一致等问题</div>
              </div>
              <div className="ride-modal-amount">Debug</div>
            </div>
            <div className="ride-qr-inline">
              <pre
                className="admin-input"
                style={{ width: "100%", minHeight: 140, whiteSpace: "pre-wrap", fontSize: 12 }}
              >
                {JSON.stringify(getChainDebugInfo(), null, 2)}
              </pre>
            </div>
            <div className="ride-modal-actions">
              <button className="dl-tab-btn" onClick={() => setDebugOpen(false)}>
                关闭
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
          <button
            className={`ride-side-tab ${active === PLAYER_SECTION_TITLE ? "is-active" : ""}`}
            onClick={() => {
              setActive(PLAYER_SECTION_TITLE);
              sectionRefs.current[PLAYER_SECTION_TITLE]?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            可接打手
          </button>
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
          <div className="ride-sections motion-stack">
            <div
              ref={(el) => {
                sectionRefs.current[PLAYER_SECTION_TITLE] = el;
              }}
              className="ride-block"
            >
              <div className="ride-block-title">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span>可接打手</span>
                  <button
                    className="dl-tab-btn"
                    style={{ padding: "4px 8px" }}
                    onClick={loadPlayers}
                    type="button"
                  >
                    {playersLoading ? "加载中..." : "刷新"}
                  </button>
                </div>
              </div>
              <div className="ride-items">
                {playersLoading && players.length === 0 ? (
                  <StateBlock tone="loading" size="compact" title="加载中" description="正在获取可接打手" />
                ) : playersError && players.length === 0 ? (
                  <StateBlock
                    tone="danger"
                    size="compact"
                    title="打手列表加载失败"
                    description={playersError}
                    actions={
                      <button className="dl-tab-btn" onClick={loadPlayers} type="button">
                        重新加载
                      </button>
                    }
                  />
                ) : players.length === 0 ? (
                  <StateBlock
                    tone="empty"
                    size="compact"
                    title="暂无可接打手"
                    description="稍后刷新或切换时间段试试"
                  />
                ) : (
                  players.map((player) => (
                    <div
                      key={player.id}
                      className="ride-row"
                      onClick={() => setSelectedPlayerId(player.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          setSelectedPlayerId(player.id);
                        }
                      }}
                    >
                      <div className="ride-row-main">
                        <div className="ride-row-title">{player.name}</div>
                        <div className="ride-row-desc">{player.role || "擅长位置待完善"}</div>
                      </div>
                      <div className="ride-row-side">
                        <label className="ride-checkbox" onClick={(event) => event.stopPropagation()}>
                          <input
                            type="radio"
                            name="selected-player"
                            checked={selectedPlayerId === player.id}
                            onChange={() => setSelectedPlayerId(player.id)}
                          />
                          <span className="ride-checkbox-box" />
                        </label>
                      </div>
                    </div>
                  ))
                )}
                {playersError && players.length > 0 && (
                  <div className="px-4 pb-2 text-xs text-rose-500">打手列表更新失败：{playersError}</div>
                )}
              </div>
              <div className="px-4 pb-2 text-[11px] text-slate-400">
                未选择将由系统匹配打手
              </div>
            </div>
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
          {firstOrderEligible && (
            <div className="ride-discount-tag">{FIRST_ORDER_DISCOUNT.label}</div>
          )}
        </div>
        <button className="ride-call" onClick={submit}>
          <QrCode size={16} style={{ marginRight: 6 }} />
          先托管再呼叫
        </button>
      </footer>
      {toast && <div className="ride-toast">{toast}</div>}
    </div>
  );
}

function deriveMode(list: LocalOrder[]): Mode {
  const latest = list.find((o) => !o.status.includes("取消") && !o.status.includes("完成")) || null;
  if (!latest) return "select";
  const chainStatus = ((latest.meta as { chain?: { status?: number } } | undefined)?.chain?.status);
  if (typeof chainStatus === "number") {
    if (chainStatus === 3) return "pending-settlement";
    if (chainStatus >= 2) return "enroute";
  }
  if (latest.status.includes("待结算") || latest.status.includes("已完成待结算")) {
    return "pending-settlement";
  }
  if (latest.driver) {
    const paymentMode = (latest.meta as { paymentMode?: string } | undefined)?.paymentMode;
    const treatedPaid = Boolean(latest.playerPaid || paymentMode === "diamond_escrow");
    return treatedPaid ? "enroute" : "await-user-pay";
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
