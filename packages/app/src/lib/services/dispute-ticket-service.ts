import { prisma, Prisma } from "@/lib/admin/admin-store-utils";
import { notDeleted } from "@/lib/shared/soft-delete";

const DISPUTE_TOPIC = "链上争议";

/** Find the support ticket created for a chain dispute by orderId */
export async function findDisputeTicketByOrderId(orderId: string) {
  const row = await prisma.adminSupportTicket.findFirst({
    where: {
      ...notDeleted,
      topic: DISPUTE_TOPIC,
      meta: { path: ["orderId"], equals: orderId },
    },
    orderBy: { createdAt: "desc" },
  });
  return row;
}

/** Close the dispute ticket when admin resolves the dispute */
export async function closeDisputeTicket(
  orderId: string,
  opts: { resolution?: string; digest?: string }
) {
  const ticket = await findDisputeTicketByOrderId(orderId);
  if (!ticket) return null;

  const existingMeta = (ticket.meta as Record<string, unknown> | null) ?? {};
  const updatedMeta: Record<string, unknown> = {
    ...existingMeta,
    resolvedAt: Date.now(),
    ...(opts.resolution ? { resolution: opts.resolution } : {}),
    ...(opts.digest ? { digest: opts.digest } : {}),
  };

  const row = await prisma.adminSupportTicket.update({
    where: { id: ticket.id },
    data: {
      status: "已完成",
      reply: opts.resolution ? `争议已解决：${opts.resolution}` : "争议已由管理员解决",
      meta: updatedMeta as Prisma.InputJsonValue,
      updatedAt: new Date(),
    },
  });
  return row;
}
