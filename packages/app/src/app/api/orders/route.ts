import { NextResponse } from "next/server";
import crypto from "crypto";

interface OrderPayload {
  user: string;
  item: string;
  amount: number; // 数量或价格数值
  currency?: string; // 可选，默认 CNY
  status?: "已支付" | "待支付" | string;
  note?: string;
}

export async function POST(req: Request) {
  let payload: OrderPayload;
  try {
    payload = (await req.json()) as OrderPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { user, item, amount, currency = "CNY", status = "已支付", note } = payload;
  if (!user || !item || typeof amount !== "number") {
    return NextResponse.json({ error: "user, item, amount are required" }, { status: 400 });
  }

  const orderId = `ORD-${Date.now()}-${crypto.randomInt(1000, 9999)}`;
  const webhook = process.env.WECHAT_WEBHOOK_URL;
  let sent = false;
  let error: string | undefined;

  if (webhook) {
    const markdown = buildMarkdown({ user, item, amount, currency, status, orderId, note });
    try {
      const res = await fetch(`${webhook}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          msgtype: "markdown",
          markdown: { content: markdown },
        }),
      });
      sent = res.ok;
      if (!res.ok) {
        error = `WeCom webhook failed: ${res.status}`;
      }
    } catch (e) {
      error = (e as Error).message;
    }
  } else {
    error = "WECHAT_WEBHOOK_URL not set";
  }

  return NextResponse.json({ orderId, sent, error: error || null });
}

function buildMarkdown({
  user,
  item,
  amount,
  currency,
  status,
  orderId,
  note,
}: {
  user: string;
  item: string;
  amount: number;
  currency: string;
  status: string;
  orderId: string;
  note?: string;
}) {
  const priceLine = currency === "CNY" ? `¥${amount}` : `${amount} ${currency}`;
  const now = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(Date.now());

  const noteLine = note ? `> 备注：${note}\n` : "";

  return [
    `🛒 <font color="info">新订单</font>`,
    `> 用户：${user}`,
    `> 商品：${item}`,
    `> 金额：${priceLine}`,
    `> 状态：${status}`,
    noteLine,
    `> 时间：${now}`,
    `> 订单号：${orderId}`,
  ]
    .filter(Boolean)
    .join("\n");
}
