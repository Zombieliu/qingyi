import { NextResponse } from "next/server";
import {
  getOrderById,
  getReviewByOrderId,
  createReview,
  creditMantou,
} from "@/lib/admin/admin-store";
import { prisma } from "@/lib/db";
import { requireUserAuth } from "@/lib/auth/user-auth";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { REVIEW_TAG_OPTIONS } from "@/lib/admin/admin-types";
import { z } from "zod";
import { parseBodyRaw } from "@/lib/shared/api-validation";
import { AdminMessages } from "@/lib/shared/messages";
import { apiBadRequest, apiForbidden, apiNotFound, apiError } from "@/lib/shared/api-response";

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
    return apiNotFound("not_found");
  }

  // Allow admin or the order's user/companion to read
  const userAddressRaw = new URL(req.url).searchParams.get("address") || "";
  if (userAddressRaw) {
    const normalized = normalizeSuiAddress(userAddressRaw);
    if (!isValidSuiAddress(normalized)) {
      return apiBadRequest("invalid_address");
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
    return apiBadRequest("invalid_address");
  }

  // Auth
  const auth = await requireUserAuth(req, {
    intent: `review:create:${orderId}`,
    address,
    body: rawBody,
  });
  if (!auth.ok) return auth.response;

  // Validate tags
  if (
    tags &&
    (!Array.isArray(tags) ||
      tags.some((t) => !(REVIEW_TAG_OPTIONS as readonly string[]).includes(t)))
  ) {
    return apiBadRequest("invalid_tags");
  }

  // Check order exists and is completed
  const order = await getOrderById(orderId);
  if (!order) {
    return apiNotFound("order_not_found");
  }
  if (order.stage !== "已完成") {
    return apiBadRequest("order_not_completed");
  }

  // Only the order user can submit a review
  if (!order.userAddress || order.userAddress !== address) {
    return apiForbidden();
  }

  // Must have a companion to review
  if (!order.companionAddress) {
    return apiBadRequest("no_companion");
  }

  // Check duplicate
  const existing = await getReviewByOrderId(orderId);
  if (existing) {
    return apiError("already_reviewed", 409);
  }

  // Create review + reward mantou + award growth points in a single transaction
  const review = await prisma.$transaction(async (tx) => {
    const rev = await createReview(
      {
        orderId,
        reviewerAddress: address,
        companionAddress: order.companionAddress || "",
        rating,
        content: content?.trim() || undefined,
        tags,
      },
      tx
    );

    // Reward mantou
    try {
      await creditMantou({
        address,
        amount: REVIEW_REWARD_MANTOU,
        orderId: `review:${orderId}`,
        note: AdminMessages.REVIEW_REWARD_NOTE,
        tx,
      });
    } catch (e) {
      console.error("review mantou reward failed:", e);
    }

    // Award growth points for review
    try {
      const { onReviewSubmitted } = await import("@/lib/services/growth-service");
      await onReviewSubmitted({ userAddress: address, orderId, tx });
    } catch (e) {
      console.error("review growth points failed:", e);
    }

    return rev;
  });

  return NextResponse.json({ review, rewarded: REVIEW_REWARD_MANTOU });
}
