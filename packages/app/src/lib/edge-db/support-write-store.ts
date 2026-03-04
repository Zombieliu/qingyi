import "server-only";

import type { AdminSupportTicket } from "@/lib/admin/admin-types";
import { insertEdgeRow } from "@/lib/edge-db/client";

function toDateIso(value: number | undefined): string | null {
  if (!value) return null;
  const ts = new Date(value);
  return Number.isFinite(ts.getTime()) ? ts.toISOString() : null;
}

export async function addSupportTicketEdgeWrite(ticket: AdminSupportTicket): Promise<void> {
  await insertEdgeRow("AdminSupportTicket", {
    id: ticket.id,
    userName: ticket.userName ?? null,
    userAddress: ticket.userAddress ?? null,
    contact: ticket.contact ?? null,
    topic: ticket.topic ?? null,
    message: ticket.message,
    status: ticket.status,
    note: ticket.note ?? null,
    reply: ticket.reply ?? null,
    meta: ticket.meta ?? null,
    createdAt: toDateIso(ticket.createdAt),
    updatedAt: toDateIso(ticket.updatedAt),
  });
}
