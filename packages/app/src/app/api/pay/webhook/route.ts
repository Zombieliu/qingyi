import { NextResponse } from "next/server";
import Stripe from "stripe";
import {
  addPaymentEvent,
  getOrderById,
  updateOrder,
  upsertLedgerRecord,
} from "@/lib/admin/admin-store";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/admin/admin-audit";
import { env } from "@/lib/env";
import { apiBadRequest, apiUnauthorized, apiError } from "@/lib/shared/api-response";

const stripeSecretKey = env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature") || "";
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret && process.env.NODE_ENV === "production") {
    return apiError("webhook_secret_required", 503);
  }

  let event: Stripe.Event;
  let verified = false;

  if (webhookSecret) {
    if (!stripe) {
      return apiError("STRIPE_SECRET_KEY not set", 503);
    }
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
      verified = true;
    } catch {
      return apiUnauthorized("invalid_signature");
    }
  } else {
    try {
      event = JSON.parse(rawBody || "{}") as Stripe.Event;
    } catch {
      return apiBadRequest("invalid_json");
    }
  }

  const eventType = event?.type || "unknown";
  const object = (event?.data as { object?: Stripe.PaymentIntent | Stripe.Charge } | undefined)
    ?.object;

  let orderId: string | undefined;
  let userAddress: string | undefined;
  let diamondAmount: string | undefined;
  let amountRaw: number | undefined;
  let status: string | undefined;
  let paymentIntentId: string | undefined;

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
  if (object) {
    if ("object" in object && object.object === "payment_intent") {
      paymentIntentId = object.id;
    } else if ("payment_intent" in object) {
      const pi = object.payment_intent;
      paymentIntentId = typeof pi === "string" ? pi : pi?.id;
    }
  }

  const isPaid = eventType === "payment_intent.succeeded";

  // Credit via external API (HTTP call, cannot be inside DB transaction)
  let creditOk = false;
  if (isPaid && userAddress && diamondAmount && env.LEDGER_ADMIN_TOKEN && paymentIntentId) {
    try {
      const url = new URL("/api/ledger/credit", req.url);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.LEDGER_ADMIN_TOKEN}`,
        },
        body: JSON.stringify({
          user: userAddress,
          amount: diamondAmount,
          receiptId: `stripe_pi_${paymentIntentId}`,
          orderId,
          amountCny: typeof amountRaw === "number" ? amountRaw / 100 : undefined,
          currency: "CNY",
          source: "stripe",
          note: "stripe webhook credit",
        }),
      });
      creditOk = res.ok;
    } catch (e) {
      console.error("webhook credit failed:", e);
    }
  }

  // Wrap addPaymentEvent + updateOrder + upsertLedgerRecord in a single transaction
  try {
    await prisma.$transaction(async (tx) => {
      await addPaymentEvent(
        {
          id: event?.id || `pay_${Date.now()}_${Math.floor(Math.random() * 9000 + 1000)}`,
          provider: "stripe",
          event: eventType,
          orderNo: orderId,
          amount: amountRaw,
          status,
          verified,
          createdAt: Date.now(),
          raw: event as unknown as Record<string, unknown>,
        },
        tx
      );

      if (orderId && isPaid) {
        const exists = await getOrderById(orderId);
        if (exists) {
          await updateOrder(orderId, { paymentStatus: "已支付" }, tx);
        }
      }

      if (isPaid && userAddress && diamondAmount && orderId) {
        const parsedAmount = Number(diamondAmount);
        if (Number.isFinite(parsedAmount) && parsedAmount > 0) {
          await upsertLedgerRecord(
            {
              id: orderId,
              userAddress,
              diamondAmount: parsedAmount,
              amount: typeof amountRaw === "number" ? amountRaw / 100 : undefined,
              currency: "CNY",
              status: creditOk ? "credited" : "paid",
              orderId,
              receiptId: paymentIntentId ? `stripe_pi_${paymentIntentId}` : undefined,
              source: "stripe",
              meta: {
                eventType,
                paymentIntentId,
                status,
              },
            },
            tx
          );
        }
      }
    });
  } catch (e) {
    console.error("webhook transaction failed:", e);
  }

  await recordAudit(
    req,
    { role: "finance", authType: "webhook" },
    "payments.webhook",
    "payment",
    orderId,
    {
      event: eventType,
      verified,
    }
  );

  return NextResponse.json({ ok: true, verified });
}
