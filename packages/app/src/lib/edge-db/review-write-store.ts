import "server-only";

import type { OrderReview } from "@/lib/admin/admin-types";
import { insertEdgeRow } from "@/lib/edge-db/client";

export async function createOrderReviewEdgeWrite(params: {
  orderId: string;
  reviewerAddress: string;
  companionAddress: string;
  rating: number;
  content?: string;
  tags?: string[];
}): Promise<OrderReview> {
  const now = Date.now();
  const id = `RV-${now}-${Math.floor(Math.random() * 10000)}`;

  await insertEdgeRow("OrderReview", {
    id,
    orderId: params.orderId,
    reviewerAddress: params.reviewerAddress,
    companionAddress: params.companionAddress,
    rating: params.rating,
    content: params.content ?? null,
    tags: params.tags ?? [],
    createdAt: new Date(now).toISOString(),
  });

  return {
    id,
    orderId: params.orderId,
    reviewerAddress: params.reviewerAddress,
    companionAddress: params.companionAddress,
    rating: params.rating,
    content: params.content,
    tags: params.tags,
    createdAt: now,
  };
}
