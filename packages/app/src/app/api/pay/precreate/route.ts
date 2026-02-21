import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { parseBodyRaw } from "@/lib/shared/api-validation";
import { requireUserAuth } from "@/lib/auth/user-auth";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";

const precreateSchema = z.object({
  platform: z.enum(["wechat", "alipay", "douyin"]),
  orderId: z.string().min(1),
  amount: z.number().positive(),
  userAddress: z.string().min(1),
  subject: z.string().default("钻石充值"),
  body: z.string().default("情谊电竞钻石充值"),
});

function buildMockParams(platform: "wechat" | "alipay" | "douyin", orderId: string) {
  const nonce = crypto.randomBytes(8).toString("hex");
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = crypto
    .createHash("sha256")
    .update(`${platform}:${orderId}:${nonce}`)
    .digest("hex");

  if (platform === "wechat") {
    return {
      timeStamp: timestamp,
      nonceStr: nonce,
      package: `prepay_id=mock_${orderId}_${nonce}`,
      signType: "RSA",
      paySign: `mock_${signature.slice(0, 32)}`,
    };
  }

  if (platform === "alipay") {
    return {
      tradeNo: `mock_trade_${orderId}_${nonce}`,
      orderStr: `mock_order_${signature.slice(0, 48)}`,
    };
  }

  return {
    orderInfo: `mock_order_info_${signature.slice(0, 48)}`,
    service: "bytepay",
  };
}

export async function POST(req: Request) {
  const parsed = await parseBodyRaw(req, precreateSchema);
  if (!parsed.success) return parsed.response;
  const { data: payload, rawBody } = parsed;

  const normalizedAddress = normalizeSuiAddress(payload.userAddress);
  if (!normalizedAddress || !isValidSuiAddress(normalizedAddress)) {
    return NextResponse.json({ error: "invalid_userAddress" }, { status: 400 });
  }

  const auth = await requireUserAuth(req, {
    intent: `pay:precreate:${payload.orderId}`,
    address: normalizedAddress,
    body: rawBody,
  });
  if (!auth.ok) return auth.response;

  const paymentId = `mock_pay_${payload.orderId}_${crypto.randomInt(1000, 9999)}`;
  const paymentParams = buildMockParams(payload.platform, payload.orderId);
  const expiresAt = Date.now() + 15 * 60 * 1000;

  return NextResponse.json({
    ok: true,
    platform: payload.platform,
    orderId: payload.orderId,
    amount: payload.amount,
    paymentId,
    paymentParams,
    expiresAt,
    mock: true,
  });
}
