import { NextResponse } from "next/server";
import crypto from "crypto";
import {
  addDuoOrder,
  queryDuoOrders,
  queryPublicDuoOrdersCursor,
} from "@/lib/admin/duo-order-store";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { requireUserAuth } from "@/lib/auth/user-auth";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/shared/api-utils";
import { z } from "zod";
import { parseBodyRaw } from "@/lib/shared/api-validation";
import { env } from "@/lib/env";
import { publishOrderEvent } from "@/lib/realtime";
import {
  apiBadRequest,
  apiUnauthorized,
  apiRateLimited,
  apiInternalError,
} from "@/lib/shared/api-response";

const duoOrderSchema = z.object({
  user: z.string().min(1),
  item: z.string().min(1),
  amount: z.number(),
  currency: z.string().default("CNY"),
  note: z.string().optional(),
  orderId: z.string().optional(),
  userAddress: z.string().optional(),
  companionAddressA: z.string().optional(),
  companionAddressB: z.string().optional(),
  chainDigest: z.string().optional(),
  chainStatus: z.number().optional(),
  serviceFee: z.number().optional(),
  depositPerCompanion: z.number().optional(),
  paymentStatus: z.string().optional(),
  stage: z.enum(["待处理", "已确认", "进行中", "已完成", "已取消"]).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize = Math.min(100, Math.max(5, Number(searchParams.get("pageSize") || "20")));
  const isPublicPool = searchParams.get("public") === "1";
  const userAddressRaw = searchParams.get("address") || searchParams.get("userAddress") || "";
  const userAddress = userAddressRaw ? normalizeSuiAddress(userAddressRaw) : "";
  if (userAddress && !isValidSuiAddress(userAddress)) return apiBadRequest("invalid address");

  if (isPublicPool) {
    if (!userAddress) return apiUnauthorized("address_required");
    const auth = await requireUserAuth(req, { intent: "duo-orders:public", address: userAddress });
    if (!auth.ok) return auth.response;
    const cursorRaw = searchParams.get("cursor") || "";
    let cursor: { createdAt: number; id: string } | undefined;
    if (cursorRaw) {
      try {
        const decoded = Buffer.from(cursorRaw, "base64url").toString("utf8");
        const parsed = JSON.parse(decoded) as { createdAt?: number; id?: string };
        if (typeof parsed.createdAt === "number" && typeof parsed.id === "string") {
          cursor = { createdAt: parsed.createdAt, id: parsed.id };
        } else return apiBadRequest("invalid_cursor");
      } catch {
        return apiBadRequest("invalid_cursor");
      }
    }
    const result = await queryPublicDuoOrdersCursor({
      pageSize: Math.min(30, pageSize),
      excludeStages: ["已完成", "已取消"],
      cursor,
    });
    const nextCursor = result.nextCursor
      ? Buffer.from(
          JSON.stringify({ createdAt: result.nextCursor.createdAt, id: result.nextCursor.id }),
          "utf8"
        ).toString("base64url")
      : null;
    return NextResponse.json({ items: result.items, nextCursor });
  }

  if (userAddress) {
    const auth = await requireUserAuth(req, { intent: "duo-orders:read", address: userAddress });
    if (!auth.ok) return auth.response;
  } else {
    const admin = await requireAdmin(req, { role: "viewer", requireOrigin: false });
    if (!admin.ok) return admin.response;
  }

  const result = await queryDuoOrders({
    page,
    pageSize,
    address: userAddress || undefined,
    q: (searchParams.get("q") || "").trim() || undefined,
  });
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const key = `duo-orders:POST:${getClientIp(req)}`;
  if (!(await rateLimit(key, env.ORDER_RATE_LIMIT_MAX, env.ORDER_RATE_LIMIT_WINDOW_MS))) {
    return apiRateLimited();
  }

  const parsed = await parseBodyRaw(req, duoOrderSchema);
  if (!parsed.success) return parsed.response;
  const { data: payload, rawBody } = parsed;

  const orderId = payload.orderId || `DUO-${Date.now()}-${crypto.randomInt(1000, 9999)}`;
  let userAddress: string | undefined;
  if (payload.userAddress) {
    const normalized = normalizeSuiAddress(payload.userAddress);
    if (!isValidSuiAddress(normalized)) return apiBadRequest("invalid userAddress");
    userAddress = normalized;
  } else {
    return apiUnauthorized("userAddress required");
  }

  const auth = await requireUserAuth(req, {
    intent: "duo-orders:create",
    address: userAddress,
    body: rawBody,
  });
  if (!auth.ok) return auth.response;

  let companionA: string | undefined;
  if (payload.companionAddressA) {
    const n = normalizeSuiAddress(payload.companionAddressA);
    if (isValidSuiAddress(n)) companionA = n;
  }
  let companionB: string | undefined;
  if (payload.companionAddressB) {
    const n = normalizeSuiAddress(payload.companionAddressB);
    if (isValidSuiAddress(n)) companionB = n;
  }

  const meta = { ...(payload.meta || {}), duoOrder: true };

  try {
    await addDuoOrder({
      id: orderId,
      user: payload.user,
      userAddress,
      companionAddressA: companionA,
      companionAddressB: companionB,
      item: payload.item,
      amount: payload.amount,
      currency: payload.currency,
      paymentStatus: payload.paymentStatus || "待处理",
      stage: payload.stage || "待处理",
      displayStatus: payload.paymentStatus || "待处理",
      note: payload.note,
      source: "app",
      chainDigest: payload.chainDigest,
      chainStatus: payload.chainStatus,
      serviceFee: payload.serviceFee,
      depositPerCompanion: payload.depositPerCompanion,
      teamStatus: 0,
      meta,
      createdAt: Date.now(),
    });

    if (userAddress) {
      void publishOrderEvent(userAddress, {
        type: "status_change",
        orderId,
        stage: "待处理",
        timestamp: Date.now(),
      });
    }
  } catch (error) {
    console.error("Failed to persist duo order:", error);
    return apiInternalError("persist_failed");
  }

  return NextResponse.json({ orderId, sent: true, error: null });
}
