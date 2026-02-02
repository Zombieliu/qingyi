import { NextResponse } from "next/server";
import Stripe from "stripe";
import { addPaymentEvent, updateOrder } from "@/lib/admin-store";
import { recordAudit } from "@/lib/admin-audit";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature") || "";
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: Stripe.Event;
  let verified = false;

  if (webhookSecret) {
    if (!stripe) {
      return NextResponse.json({ error: "STRIPE_SECRET_KEY not set" }, { status: 503 });
    }
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
      verified = true;
    } catch {
      return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
    }
  } else {
    try {
      event = JSON.parse(rawBody || "{}") as Stripe.Event;
    } catch {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }
  }

  const eventType = event?.type || "unknown";
  const object = (event?.data as { object?: Stripe.PaymentIntent | Stripe.Charge } | undefined)?.object;

  let orderId: string | undefined;
  let userAddress: string | undefined;
  let diamondAmount: string | undefined;
  let amountRaw: number | undefined;
  let status: string | undefined;

  if (object && "metadata" in object) {
    orderId = object.metadata?.orderId || object.metadata?.order_id;
    userAddress = object.metadata?.userAddress || object.metadata?.user_address;
    diamondAmount = object.metadata?.diamondAmount || object.metadata?.diamond_amount;
  }
  if (object && "amount" in object) {
    amountRaw = object.amount ?? undefined;
  }
  if (object && "status" in object) {
    status = object.status || undefined;
  }

  await addPaymentEvent({
    id: `pay_${Date.now()}_${Math.floor(Math.random() * 9000 + 1000)}`,
    provider: "stripe",
    event: eventType,
    orderNo: orderId,
    amount: amountRaw,
    status,
    verified,
    createdAt: Date.now(),
    raw: event as unknown as Record<string, unknown>,
  });

  const isPaid = eventType === "payment_intent.succeeded" || eventType === "charge.succeeded";
  if (orderId && isPaid) {
    try {
      await updateOrder(orderId, { paymentStatus: "已支付" });
    } catch {
      // ignore missing orders
    }
  }

  if (isPaid && userAddress && diamondAmount && process.env.LEDGER_ADMIN_TOKEN) {
    try {
      const url = new URL("/api/ledger/credit", req.url);
      await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.LEDGER_ADMIN_TOKEN}`,
        },
        body: JSON.stringify({
          user: userAddress,
          amount: diamondAmount,
          receiptId: `stripe_${event?.id || orderId || Date.now()}`,
          note: "stripe webhook credit",
        }),
      });
    } catch {
      // ignore credit errors to avoid blocking webhook response
    }
  }

  await recordAudit(req, { role: "finance", authType: "webhook" }, "payments.webhook", "payment", orderId, {
    event: eventType,
    verified,
  });

  return NextResponse.json({ ok: true, verified });
}
