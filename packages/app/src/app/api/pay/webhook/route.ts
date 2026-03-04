import { NextResponse } from "next/server";
import { after } from "next/server";
import Stripe from "stripe";
import { recordAudit } from "@/lib/admin/admin-audit";
import { env } from "@/lib/env";
import { apiBadRequest, apiUnauthorized, apiError } from "@/lib/shared/api-response";
import { publishOrderEvent } from "@/lib/realtime";
import { DIAMOND_RATE } from "@/lib/shared/constants";
import {
  createPaymentEventEdgeWrite,
  getOrderExistsByIdEdgeRead,
  updateOrderPaymentStatusEdgeWrite,
  upsertLedgerRecordEdgeWrite,
} from "@/lib/edge-db/payment-reconcile-store";

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

  const parsedDiamondAmount = Number(diamondAmount);
  const expectedDiamonds =
    typeof amountRaw === "number" ? Math.round((amountRaw / 100) * DIAMOND_RATE) : Number.NaN;
  const pricingMatch =
    Number.isFinite(parsedDiamondAmount) &&
    parsedDiamondAmount > 0 &&
    Number.isFinite(expectedDiamonds) &&
    expectedDiamonds > 0 &&
    expectedDiamonds === parsedDiamondAmount;

  // P0 FIX: Only process payment mutations when webhook signature is verified.
  // Unverified or mismatched pricing events are logged but never trigger credit or status changes.
  const shouldMutate = verified && isPaid && pricingMatch;

  try {
    await createPaymentEventEdgeWrite({
      id: event?.id || `pay_${Date.now()}_${Math.floor(Math.random() * 9000 + 1000)}`,
      provider: "stripe",
      event: eventType,
      orderNo: orderId,
      amount: amountRaw,
      status,
      verified,
      createdAt: Date.now(),
      raw: event as unknown as Record<string, unknown>,
    });

    if (shouldMutate && orderId) {
      const exists = await getOrderExistsByIdEdgeRead(orderId);
      if (exists) {
        await updateOrderPaymentStatusEdgeWrite(orderId, "已支付");
      }
    }

    if (shouldMutate && userAddress && diamondAmount && orderId) {
      if (Number.isFinite(parsedDiamondAmount) && parsedDiamondAmount > 0) {
        await upsertLedgerRecordEdgeWrite({
          id: orderId,
          userAddress,
          diamondAmount: parsedDiamondAmount,
          amount: typeof amountRaw === "number" ? amountRaw / 100 : undefined,
          currency: "CNY",
          status: "paid",
          orderId,
          receiptId: paymentIntentId ? `stripe_pi_${paymentIntentId}` : undefined,
          source: "stripe",
          meta: {
            eventType,
            paymentIntentId,
            status,
          },
        });
      }
    }
  } catch (e) {
    console.error("webhook transaction failed:", e);
  }

  // Notify user via SSE after transaction commits
  if (shouldMutate && orderId && userAddress) {
    after(
      publishOrderEvent(userAddress, {
        type: "status_change",
        orderId,
        status: "已支付",
        timestamp: Date.now(),
      })
    );
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
      pricingMatch,
    }
  );

  return NextResponse.json({ ok: true, verified });
}
