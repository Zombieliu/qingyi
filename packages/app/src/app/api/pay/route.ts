import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

export async function POST(req: Request) {
  let payload: {
    amount: number;
    subject?: string;
    body?: string;
    channel?: "alipay" | "wechat_pay";
    orderId?: string;
    userAddress?: string;
    diamondAmount?: number;
    returnUrl?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const {
    amount,
    subject = "钻石充值",
    body = "情谊电竞钻石充值",
    channel,
    orderId,
    userAddress,
    diamondAmount,
    returnUrl,
  } = payload;
  if (typeof amount !== "number" || amount <= 0) {
    return NextResponse.json({ error: "amount must be number" }, { status: 400 });
  }
  if (!stripe) {
    return NextResponse.json({ error: "STRIPE_SECRET_KEY not set" }, { status: 503 });
  }
  if (channel !== "alipay" && channel !== "wechat_pay") {
    return NextResponse.json({ error: "channel must be alipay or wechat_pay" }, { status: 400 });
  }
  if (!orderId) {
    return NextResponse.json({ error: "orderId required" }, { status: 400 });
  }
  if (!userAddress) {
    return NextResponse.json({ error: "userAddress required" }, { status: 400 });
  }
  if (!diamondAmount || !Number.isFinite(diamondAmount) || diamondAmount <= 0) {
    return NextResponse.json({ error: "diamondAmount required" }, { status: 400 });
  }

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
    let intent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: "cny",
      description: body,
      metadata: {
        orderId,
        userAddress,
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
    });

    if (intent.next_action?.type === "wechat_pay_display_qr_code") {
      const wechat = (intent.next_action as {
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
      }).wechat_pay_display_qr_code;
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
      (nextAction as { alipay_handle_redirect?: { url?: string } } | undefined)?.alipay_handle_redirect?.url ||
      null;
    const wechatQr =
      (nextAction as {
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
      } | undefined)?.wechat_pay_display_qr_code || null;

    return NextResponse.json({
      paymentIntentId: intent.id,
      clientSecret: intent.client_secret,
      status: intent.status,
      nextAction,
      nextActionType,
      redirectUrl,
      qrCodeUrl: wechatQr?.image_url_png || wechatQr?.image_url_svg || wechatQr?.image_url || wechatQr?.qr_code_url || null,
      qrCodeData: wechatQr?.image_data_url || wechatQr?.image_data || null,
      qrCodeLink: wechatQr?.hosted_instructions_url || null,
      qrCodeText: wechatQr?.data || null,
    });
  } catch (e) {
    const message = (e as Error).message || "stripe request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
