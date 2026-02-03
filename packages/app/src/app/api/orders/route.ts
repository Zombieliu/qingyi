import { NextResponse } from "next/server";
import crypto from "crypto";
import { addOrder, queryOrders } from "@/lib/admin-store";
import { requireAdmin } from "@/lib/admin-auth";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";

interface OrderPayload {
  user: string;
  userAddress?: string;
  companionAddress?: string;
  item: string;
  amount: number; // 数量或价格数值
  currency?: string; // 可选，默认 CNY
  status?: "已支付" | "待支付" | string;
  stage?: string;
  paymentStatus?: string;
  note?: string;
  orderId?: string;
  chainDigest?: string;
  chainStatus?: number;
  serviceFee?: number;
  deposit?: number;
  meta?: Record<string, unknown>;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize = Math.min(200, Math.max(5, Number(searchParams.get("pageSize") || "20")));
  const userAddressRaw = searchParams.get("userAddress") || "";
  const userAddress = userAddressRaw ? normalizeSuiAddress(userAddressRaw) : "";
  if (userAddress && !isValidSuiAddress(userAddress)) {
    return NextResponse.json({ error: "invalid userAddress" }, { status: 400 });
  }
  const user = (searchParams.get("user") || "").trim();
  const q = (searchParams.get("q") || "").trim();

  if (!userAddress && !user && !q) {
    const admin = await requireAdmin(req, { role: "viewer", requireOrigin: false });
    if (!admin.ok) return admin.response;
  }

  const result = await queryOrders({
    page,
    pageSize,
    address: userAddress || undefined,
    q: user || q || undefined,
  });
  return NextResponse.json(result);
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

  const orderId = payload.orderId || `ORD-${Date.now()}-${crypto.randomInt(1000, 9999)}`;
  const createdAt = Date.now();
  let userAddress: string | undefined;
  if (payload.userAddress) {
    const normalized = normalizeSuiAddress(payload.userAddress);
    if (!isValidSuiAddress(normalized)) {
      return NextResponse.json({ error: "invalid userAddress" }, { status: 400 });
    }
    userAddress = normalized;
  }
  let companionAddress: string | undefined;
  if (payload.companionAddress) {
    const normalized = normalizeSuiAddress(payload.companionAddress);
    if (!isValidSuiAddress(normalized)) {
      return NextResponse.json({ error: "invalid companionAddress" }, { status: 400 });
    }
    companionAddress = normalized;
  }
  const meta = payload.meta ? { ...payload.meta } : {};
  if (payload.status) meta.status = payload.status;
  if ((payload.meta as { time?: string } | undefined)?.time) {
    meta.time = (payload.meta as { time?: string }).time;
  } else {
    meta.time = new Date(createdAt).toISOString();
  }

  try {
    await addOrder({
      id: orderId,
      user,
      userAddress,
      companionAddress,
      item,
      amount,
      currency,
      paymentStatus: payload.paymentStatus || status,
      stage: (payload.stage as "待处理" | "已确认" | "进行中" | "已完成" | "已取消") || "待处理",
      note,
      source: "app",
      chainDigest: payload.chainDigest,
      chainStatus: payload.chainStatus,
      serviceFee: payload.serviceFee,
      deposit: payload.deposit,
      meta,
      createdAt,
    });
  } catch (error) {
    console.error("Failed to persist order:", error);
  }
  if (process.env.E2E_SKIP_WEBHOOK === "1") {
    return NextResponse.json({ orderId, sent: true, error: null });
  }

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
