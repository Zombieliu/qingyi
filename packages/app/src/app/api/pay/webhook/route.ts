import { NextResponse } from "next/server";
import crypto from "crypto";
import { addPaymentEvent, updateOrder } from "@/lib/admin-store";
import { recordAudit } from "@/lib/admin-audit";

function verifySignature(body: string, signature: string, publicKey?: string, secret?: string) {
  if (publicKey) {
    try {
      return crypto.verify("RSA-SHA256", Buffer.from(body), publicKey, Buffer.from(signature, "base64"));
    } catch {
      return false;
    }
  }
  if (secret) {
    const hmacHex = crypto.createHmac("sha256", secret).update(body).digest("hex");
    const hmacB64 = crypto.createHmac("sha256", secret).update(body).digest("base64");
    const sig = signature.trim();
    return sig === hmacHex || sig === hmacB64;
  }
  return false;
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature =
    req.headers.get("x-pingplusplus-signature") ||
    req.headers.get("x-signature") ||
    req.headers.get("x-webhook-signature") ||
    "";
  const publicKey = process.env.PINGPP_WEBHOOK_PUBLIC_KEY;
  const secret = process.env.PINGPP_WEBHOOK_SECRET;
  const sharedToken = process.env.PINGPP_WEBHOOK_TOKEN;

  if (sharedToken) {
    const token = req.headers.get("x-webhook-token") || new URL(req.url).searchParams.get("token") || "";
    if (token !== sharedToken) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  } else if (publicKey || secret) {
    if (!signature || !verifySignature(rawBody, signature, publicKey, secret)) {
      return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
    }
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const eventType = (payload.type || payload.event || "unknown") as string;
  const data = (payload.data as { object?: Record<string, unknown> } | undefined)?.object || {};
  const metadata = (data.metadata as Record<string, unknown> | undefined) || {};
  const orderId =
    (metadata.orderId as string | undefined) ||
    (metadata.order_id as string | undefined) ||
    (data.order_no as string | undefined) ||
    (payload.order_no as string | undefined);
  const amountRaw = (data.amount as number | undefined) ?? undefined;
  const status = (data.status as string | undefined) || (data.paid as boolean | undefined ? "paid" : undefined);

  await addPaymentEvent({
    id: `pay_${Date.now()}_${crypto.randomInt(1000, 9999)}`,
    provider: "pingpp",
    event: eventType,
    orderNo: orderId,
    amount: amountRaw,
    status,
    verified: Boolean(signature && (publicKey || secret)) || Boolean(sharedToken),
    createdAt: Date.now(),
    raw: payload,
  });

  const isPaid = typeof eventType === "string" && eventType.includes("succeeded");
  if (orderId && isPaid) {
    await updateOrder(orderId, { paymentStatus: "已支付" });
  }

  await recordAudit(req, { role: "finance", authType: "webhook" }, "payments.webhook", "payment", orderId, {
    event: eventType,
  });

  return NextResponse.json({ ok: true });
}
