"use client";
import { t } from "@/lib/i18n/t";
import { useEffect, useMemo, useState } from "react";
import { getCurrentAddress } from "@/lib/chain/qy-chain-lite";
import { useBalance } from "@/app/components/balance-provider";
import { fetchWithUserAuth } from "@/lib/auth/user-auth-client";
import { formatErrorMessage } from "@/lib/shared/error-utils";
import {
  type Option,
  type PayChannel,
  type PayResponse,
  type StatusMessage,
  options,
} from "./wallet-data";

export function useWalletState() {
  const [selected, setSelected] = useState<Option>(options[0]);
  const [customAmount, setCustomAmount] = useState("");
  const [customTouched, setCustomTouched] = useState(false);
  const [agree, setAgree] = useState(false);
  const [channel, setChannel] = useState<PayChannel>("alipay");
  const [payInfo, setPayInfo] = useState<PayResponse | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const { balance, refresh } = useBalance();

  const unitPrice = useMemo(() => options[0].price / options[0].amount, []);
  const customOption = useMemo<Option | null>(() => {
    const raw = Number(customAmount);
    if (!Number.isFinite(raw)) return null;
    const amount = Math.floor(raw);
    if (amount <= 0) return null;
    const price = Number((amount * unitPrice).toFixed(2));
    return { amount, price };
  }, [customAmount, unitPrice]);
  const isCustomSelected =
    !!customOption &&
    selected.amount === customOption.amount &&
    selected.price === customOption.price;

  useEffect(() => {
    if (isCustomSelected && customOption) {
      setSelected(customOption);
    }
  }, [customOption, isCustomSelected]);

  const customError = useMemo(() => {
    if (!customTouched && !customAmount) return null;
    if (!customAmount) return t("ui.wallet.678");
    const raw = Number(customAmount);
    if (!Number.isFinite(raw)) return t("ui.wallet.679");
    if (!Number.isInteger(raw)) return t("ui.wallet.680");
    if (raw <= 0) return t("ui.wallet.648");
    return null;
  }, [customAmount, customTouched]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const redirectStatus = params.get("redirect_status");
    let attempts = redirectStatus === "succeeded" ? 6 : 1;
    if (redirectStatus === "succeeded") {
      setStatus({
        tone: "loading",
        title: t("ui.wallet.618"),
        description: t("tabs.wallet.i072"),
      });
      setPollCount(0);
    }
    const fetchBalance = async () => {
      try {
        const next = await refresh({ force: redirectStatus === "succeeded" });
        if (next !== null) {
          if (redirectStatus === "succeeded") {
            setStatus({
              tone: "success",
              title: t("tabs.wallet.i073"),
              description: t("tabs.wallet.i074"),
            });
          }
        }
      } catch {
        // ignore balance errors
      } finally {
        attempts -= 1;
        if (attempts > 0) {
          if (redirectStatus === "succeeded") {
            setPollCount((count) => count + 1);
          }
          setTimeout(fetchBalance, 2000);
        } else if (redirectStatus === "succeeded") {
          setStatus({
            tone: "warning",
            title: t("tabs.wallet.i075"),
            description: t("tabs.wallet.i076"),
          });
        }
      }
    };
    fetchBalance();
  }, [refresh]);

  const wechatQrSrc = useMemo(() => {
    if (!payInfo) return null;
    if (payInfo.qrCodeData) {
      return payInfo.qrCodeData.startsWith("data:")
        ? payInfo.qrCodeData
        : `data:image/png;base64,${payInfo.qrCodeData}`;
    }
    return payInfo.qrCodeUrl || null;
  }, [payInfo]);

  const wechatQrHint = useMemo(() => {
    if (!payInfo) return null;
    if (wechatQrSrc) return null;
    if (payInfo.qrCodeLink) return t("ui.wallet.568");
    if (payInfo.qrCodeText) return t("ui.wallet.569");
    return null;
  }, [payInfo, wechatQrSrc]);

  const statusDescription =
    status?.tone === "loading" && pollCount > 0 ? `已轮询 ${pollCount} 次…` : status?.description;

  const handleConfirm = async () => {
    if (!agree) {
      setStatus({ tone: "warning", title: t("ui.wallet.675") });
      return;
    }
    if (loading) return;
    setLoading(true);
    setStatus(null);
    setPayInfo(null);
    const address = getCurrentAddress();
    if (!address) {
      setStatus({ tone: "warning", title: t("ui.wallet.676") });
      setLoading(false);
      return;
    }

    const nextOrderId = `ORD-${Date.now()}`;
    setOrderId(nextOrderId);

    try {
      const res = await fetchWithUserAuth(
        "/api/pay",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: selected.price,
            channel,
            orderId: nextOrderId,
            userAddress: address,
            diamondAmount: selected.amount,
            subject: t("tabs.wallet.i077"),
            body: `钻石充值 ${selected.amount} 钻石`,
            returnUrl:
              typeof window !== "undefined" ? `${window.location.origin}/wallet` : undefined,
          }),
        },
        address
      );
      const data = (await res.json()) as PayResponse & { error?: string };
      if (!res.ok) {
        setStatus({ tone: "danger", title: data.error || t("tabs.wallet.i138") });
        return;
      }
      setPayInfo(data);
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }
      if (!data.qrCodeData && !data.qrCodeUrl && !data.qrCodeLink && !data.qrCodeText) {
        if (channel === "alipay") {
          if (data.status === "succeeded") {
            setStatus({ tone: "success", title: t("ui.wallet.617") });
          } else {
            const info = data.nextActionType ? `，动作：${data.nextActionType}` : "";
            setStatus({
              tone: "warning",
              title: `未获取到支付宝跳转链接（状态：${data.status || "unknown"}${info}），请稍后重试`,
            });
          }
        } else {
          const info = data.nextActionType ? `，动作：${data.nextActionType}` : "";
          setStatus({
            tone: "warning",
            title: `未获取到二维码（状态：${data.status || "unknown"}${info}），请稍后重试`,
          });
        }
      }
    } catch (error) {
      setStatus({ tone: "danger", title: formatErrorMessage(error, t("wallet.001")) });
    } finally {
      setLoading(false);
    }
  };

  return {
    selected,
    setSelected,
    customAmount,
    setCustomAmount,
    customTouched,
    setCustomTouched,
    agree,
    setAgree,
    channel,
    setChannel,
    payInfo,
    orderId,
    loading,
    status,
    balance,
    unitPrice,
    customOption,
    isCustomSelected,
    customError,
    wechatQrSrc,
    wechatQrHint,
    statusDescription,
    handleConfirm,
  };
}
