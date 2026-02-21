import type { OrderReview } from "./admin-types";
import { prisma, Prisma } from "./admin-store-utils";

function mapReview(row: {
  id: string;
  orderId: string;
  reviewerAddress: string;
  companionAddress: string;
  rating: number;
  content: string | null;
  tags: Prisma.JsonValue | null;
  createdAt: Date;
}): OrderReview {
  return {
    id: row.id,
    orderId: row.orderId,
    reviewerAddress: row.reviewerAddress,
    companionAddress: row.companionAddress,
    rating: row.rating,
    content: row.content || undefined,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : undefined,
    createdAt: row.createdAt.getTime(),
  };
}

export async function getReviewByOrderId(orderId: string): Promise<OrderReview | null> {
  const row = await prisma.orderReview.findUnique({ where: { orderId } });
  return row ? mapReview(row) : null;
}

export async function createReview(params: {
  orderId: string;
  reviewerAddress: string;
  companionAddress: string;
  rating: number;
  content?: string;
  tags?: string[];
}): Promise<OrderReview> {
  const now = new Date();
  const row = await prisma.orderReview.create({
    data: {
      id: `RV-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      orderId: params.orderId,
      reviewerAddress: params.reviewerAddress,
      companionAddress: params.companionAddress,
      rating: params.rating,
      content: params.content ?? null,
      tags: params.tags ?? [],
      createdAt: now,
    },
  });
  return mapReview(row);
}

export async function getReviewsByCompanion(
  companionAddress: string,
  limit = 20
): Promise<{ items: OrderReview[]; avgRating: number; total: number }> {
  const [rows, total] = await Promise.all([
    prisma.orderReview.findMany({
      where: { companionAddress },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.orderReview.count({ where: { companionAddress } }),
  ]);
  const items = rows.map(mapReview);
  const avgRating =
    items.length > 0 ? items.reduce((sum, r) => sum + r.rating, 0) / items.length : 0;
  return { items, avgRating: Math.round(avgRating * 10) / 10, total };
}
