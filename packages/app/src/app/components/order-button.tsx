"use client";
import { useState } from "react";
import { createOrder } from "./order-service";
import { createChainOrderId, createOrderOnChain, getCurrentAddress, isChainOrdersEnabled } from "@/lib/qy-chain";

interface Props {
  user: string;
  item: string;
  amount: number;
  note?: string;
}

export default function OrderButton({ user, item, amount, note }: Props) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async () => {
    try {
      setLoading(true);
      setMsg(null);
      let chainOrderId: string | null = null;
      let chainDigest: string | null = null;
      if (isChainOrdersEnabled()) {
        chainOrderId = createChainOrderId();
        const chainResult = await createOrderOnChain({
          orderId: chainOrderId,
          serviceFee: amount,
          deposit: 0,
          autoPay: true,
        });
        chainDigest = chainResult.digest;
      }
      const result = await createOrder({
        id: chainOrderId || `${Date.now()}`,
        user,
        userAddress: isChainOrdersEnabled() ? getCurrentAddress() : undefined,
        item,
        amount,
        status: "已支付",
        time: new Date().toISOString(),
        chainDigest: chainDigest || undefined,
        note,
      });
      if (result.sent === false) {
        setMsg(result.error || "订单已创建，通知失败");
      } else {
        setMsg(chainDigest ? "已上链并同步到微信群" : "已同步到微信群");
      }
    } catch (e) {
      setMsg((e as Error).message || "下单失败");
    } finally {
      setLoading(false);
      setTimeout(() => setMsg(null), 3000);
    }
  };

  return (
    <button
      onClick={submit}
      disabled={loading}
      className="lc-order"
      aria-label={`为 ${user} 下单 ${item}`}
    >
      {loading ? "发送中..." : "自助下单"}
      {msg && <span className="lc-order-tip">{msg}</span>}
    </button>
  );
}
