import { NextResponse } from "next/server";
import Stripe from "stripe";
import { upsertLedgerRecord } from "@/lib/admin/admin-store";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { requireUserAuth } from "@/lib/auth/user-auth";
import { z } from "zod";
import { parseBodyRaw } from "@/lib/shared/api-validation";
import { env } from "@/lib/env";

const paySchema = z.object({
  amount: z.number().positive(),
  subject: z.string().default("钻石充值"),
  body: z.string().default("情谊电竞钻石充值"),
  channel: z.enum(["alipay", "wechat_pay"]),
  orderId: z.string().min(1),
  userAddress: z.string().min(1),
  diamondAmount: z.number().positive(),
  returnUrl: z.string().optional(),
});

const stripeSecretKey = env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

export async function POST(req: Request) {
  const parsed = await parseBodyRaw(req, paySchema);
  if (!parsed.success) return parsed.response;
  const { data: payload, rawBody } = parsed;

  const { amount, subject, body, channel, orderId, userAddress, diamondAmount, returnUrl } =
    payload;

  if (!stripe) {
    return NextResponse.json({ error: "STRIPE_SECRET_KEY not set" }, { status: 503 });
  }
  const normalizedAddress = normalizeSuiAddress(userAddress);
  if (!isValidSuiAddress(normalizedAddress)) {
    return NextResponse.json({ error: "invalid userAddress" }, { status: 400 });
  }
  const auth = await requireUserAuth(req, {
    intent: `pay:create:${orderId}`,
    address: normalizedAddress,
    body: rawBody,
  });
  if (!auth.ok) return auth.response;

  let resolvedReturnUrl = returnUrl;
  if (!resolvedReturnUrl) {
    const origin = req.headers.get("origin");
    if (origin) {
      resolvedReturnUrl = `${origin}/wallet`;
    }
  }
  if (channel === "alipay" && !resolvedReturnUrl) {
    return NextResponse.json({ error: "returnUrl required for alipay" }, { status: 400 });
  }

  try {
    let intent = await stripe.paymentIntents.create(
      {
        amount: Math.round(amount * 100),
        currency: "cny",
        description: body,
        metadata: {
          orderId,
          userAddress: auth.address,
          diamondAmount: String(diamondAmount),
          subject,
        },
        payment_method_types: [channel],
        payment_method_data: { type: channel },
        payment_method_options:
          channel === "wechat_pay"
            ? {
                wechat_pay: {
                  client: "web",
                },
              }
            : undefined,
        confirm: true,
        return_url: resolvedReturnUrl || undefined,
      },
      { idempotencyKey: `pay:${orderId}` }
    );

    if (intent.next_action?.type === "wechat_pay_display_qr_code") {
      const wechat = (
        intent.next_action as {
          wechat_pay_display_qr_code?: {
            image_url?: string;
            image_data?: string;
            qr_code_url?: string;
            image_url_png?: string;
            image_url_svg?: string;
            image_data_url?: string;
            hosted_instructions_url?: string;
            data?: string;
          };
        }
      ).wechat_pay_display_qr_code;
      if (
        !wechat?.image_url &&
        !wechat?.image_data &&
        !wechat?.qr_code_url &&
        !wechat?.image_url_png &&
        !wechat?.image_url_svg &&
        !wechat?.image_data_url &&
        !wechat?.hosted_instructions_url &&
        !wechat?.data
      ) {
        try {
          intent = await stripe.paymentIntents.retrieve(intent.id);
        } catch {
          // ignore refresh errors
        }
      }
    }

    const nextAction = intent.next_action || undefined;
    const nextActionType = (nextAction as { type?: string } | undefined)?.type || null;
    const redirectUrl =
      (nextAction as { redirect_to_url?: { url?: string } } | undefined)?.redirect_to_url?.url ||
      (nextAction as { alipay_handle_redirect?: { url?: string } } | undefined)
        ?.alipay_handle_redirect?.url ||
      null;
    const wechatQr =
      (
        nextAction as
          | {
              wechat_pay_display_qr_code?: {
                image_url?: string;
                image_data?: string;
                qr_code_url?: string;
                image_url_png?: string;
                image_url_svg?: string;
                image_data_url?: string;
                hosted_instructions_url?: string;
                data?: string;
              };
            }
          | undefined
      )?.wechat_pay_display_qr_code || null;

    const recordStatus = intent.status === "succeeded" ? "paid" : "pending";
    try {
      await upsertLedgerRecord({
        id: orderId,
        userAddress: auth.address,
        diamondAmount,
        amount,
        currency: "CNY",
        channel,
        status: recordStatus,
        orderId,
        source: "stripe",
        meta: {
          paymentIntentId: intent.id,
          status: intent.status,
        },
        createdAt: Date.now(),
      });
    } catch {
      // ignore ledger record failures to avoid blocking payment flow
    }

    return NextResponse.json({
      paymentIntentId: intent.id,
      clientSecret: intent.client_secret,
      status: intent.status,
      nextAction,
      nextActionType,
      redirectUrl,
      qrCodeUrl:
        wechatQr?.image_url_png ||
        wechatQr?.image_url_svg ||
        wechatQr?.image_url ||
        wechatQr?.qr_code_url ||
        null,
      qrCodeData: wechatQr?.image_data_url || wechatQr?.image_data || null,
      qrCodeLink: wechatQr?.hosted_instructions_url || null,
      qrCodeText: wechatQr?.data || null,
    });
  } catch (e) {
    const message = (e as Error).message || "stripe request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
