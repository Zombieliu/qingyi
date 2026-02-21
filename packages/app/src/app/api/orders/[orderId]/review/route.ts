import { NextResponse } from "next/server";
import {
  getOrderById,
  getReviewByOrderId,
  createReview,
  creditMantou,
} from "@/lib/admin/admin-store";
import { requireUserAuth } from "@/lib/auth/user-auth";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { REVIEW_TAG_OPTIONS } from "@/lib/admin/admin-types";
import { z } from "zod";
import { parseBodyRaw } from "@/lib/shared/api-validation";

const reviewSchema = z.object({
  address: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  content: z.string().max(500).optional(),
  tags: z.array(z.string()).optional(),
});

type RouteContext = {
  params: Promise<{ orderId: string }>;
};

const REVIEW_REWARD_MANTOU = 5;

export async function GET(req: Request, { params }: RouteContext) {
  const { orderId } = await params;
  const review = await getReviewByOrderId(orderId);
  if (!review) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Allow admin or the order's user/companion to read
  const userAddressRaw = new URL(req.url).searchParams.get("address") || "";
  if (userAddressRaw) {
    const normalized = normalizeSuiAddress(userAddressRaw);
    if (!isValidSuiAddress(normalized)) {
      return NextResponse.json({ error: "invalid_address" }, { status: 400 });
    }
    const auth = await requireUserAuth(req, {
      intent: `review:read:${orderId}`,
      address: normalized,
    });
    if (!auth.ok) return auth.response;
    return NextResponse.json(review);
  }

  const admin = await requireAdmin(req, { role: "viewer", requireOrigin: false });
  if (!admin.ok) return admin.response;
  return NextResponse.json(review);
}

export async function POST(req: Request, { params }: RouteContext) {
  const { orderId } = await params;

  const parsed = await parseBodyRaw(req, reviewSchema);
  if (!parsed.success) return parsed.response;
  const { data: body, rawBody } = parsed;

  const { address: addressRaw, rating, content, tags } = body;
  const address = normalizeSuiAddress(addressRaw);
  if (!isValidSuiAddress(address)) {
    return NextResponse.json({ error: "invalid_address" }, { status: 400 });
  }

  // Auth
  const auth = await requireUserAuth(req, {
    intent: `review:create:${orderId}`,
    address,
    body: rawBody,
  });
  if (!auth.ok) return auth.response;

  // Validate tags
  if (tags && (!Array.isArray(tags) || tags.some((t) => !REVIEW_TAG_OPTIONS.includes(t)))) {
    return NextResponse.json({ error: "invalid_tags" }, { status: 400 });
  }

  // Check order exists and is completed
  const order = await getOrderById(orderId);
  if (!order) {
    return NextResponse.json({ error: "order_not_found" }, { status: 404 });
  }
  if (order.stage !== "已完成") {
    return NextResponse.json({ error: "order_not_completed" }, { status: 400 });
  }

  // Only the order user can submit a review
  if (!order.userAddress || order.userAddress !== address) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Must have a companion to review
  if (!order.companionAddress) {
    return NextResponse.json({ error: "no_companion" }, { status: 400 });
  }

  // Check duplicate
  const existing = await getReviewByOrderId(orderId);
  if (existing) {
    return NextResponse.json({ error: "already_reviewed" }, { status: 409 });
  }

  const review = await createReview({
    orderId,
    reviewerAddress: address,
    companionAddress: order.companionAddress,
    rating,
    content: content?.trim() || undefined,
    tags,
  });

  // Reward mantou (non-blocking)
  try {
    await creditMantou({
      address,
      amount: REVIEW_REWARD_MANTOU,
      orderId: `review:${orderId}`,
      note: "评价奖励",
    });
  } catch {
    // non-critical
  }

  return NextResponse.json({ review, rewarded: REVIEW_REWARD_MANTOU });
}
