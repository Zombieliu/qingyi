"use client";
import { useState } from "react";
import { addOrder } from "./order-store";
import { createChainOrderId, createOrderOnChain, isChainOrdersEnabled } from "@/lib/qy-chain";

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
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user, item, amount, note, status: "已支付" }),
      });
      const data = await res.json();
      if (!res.ok || !data.sent) {
        throw new Error(data.error || "发送失败");
      }
      addOrder({
        id: chainOrderId || data.orderId || `${Date.now()}`,
        user,
        item,
        amount,
        status: "已支付",
        time: new Date().toISOString(),
        chainDigest: chainDigest || undefined,
      });
      setMsg(chainDigest ? "已上链并同步到微信群" : "已同步到微信群");
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
