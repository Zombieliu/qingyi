import type { LedgerRecord } from "./admin-types";
import { prisma, Prisma } from "./admin-store-utils";

function mapLedgerRecord(row: {
  id: string;
  userAddress: string;
  diamondAmount: number;
  amount: number | null;
  currency: string | null;
  channel: string | null;
  status: string;
  orderId: string | null;
  receiptId: string | null;
  source: string | null;
  note: string | null;
  meta: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date | null;
}): LedgerRecord {
  return {
    id: row.id,
    userAddress: row.userAddress,
    diamondAmount: row.diamondAmount,
    amount: row.amount ?? undefined,
    currency: row.currency || undefined,
    channel: row.channel || undefined,
    status: row.status,
    orderId: row.orderId || undefined,
    receiptId: row.receiptId || undefined,
    source: row.source || undefined,
    note: row.note || undefined,
    meta: (row.meta as Record<string, unknown> | null) || undefined,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt ? row.updatedAt.getTime() : undefined,
  };
}

type LedgerRecordInput = Omit<LedgerRecord, "createdAt" | "updatedAt"> & { createdAt?: number };

export async function upsertLedgerRecord(entry: LedgerRecordInput) {
  const now = Date.now();
  const createdAt = new Date(entry.createdAt ?? now);
  const updateData: Prisma.LedgerRecordUpdateInput = {
    userAddress: entry.userAddress,
    diamondAmount: entry.diamondAmount,
    status: entry.status,
    updatedAt: new Date(now),
  };
  if (entry.amount !== undefined) updateData.amount = entry.amount;
  if (entry.currency !== undefined) updateData.currency = entry.currency;
  if (entry.channel !== undefined) updateData.channel = entry.channel;
  if (entry.orderId !== undefined) updateData.orderId = entry.orderId;
  if (entry.receiptId !== undefined) updateData.receiptId = entry.receiptId;
  if (entry.source !== undefined) updateData.source = entry.source;
  if (entry.note !== undefined) updateData.note = entry.note;
  if (entry.meta !== undefined) {
    updateData.meta = entry.meta ? (entry.meta as Prisma.InputJsonValue) : Prisma.DbNull;
  }

  const row = await prisma.ledgerRecord.upsert({
    where: { id: entry.id },
    create: {
      id: entry.id,
      userAddress: entry.userAddress,
      diamondAmount: entry.diamondAmount,
      amount: entry.amount ?? null,
      currency: entry.currency ?? null,
      channel: entry.channel ?? null,
      status: entry.status,
      orderId: entry.orderId ?? null,
      receiptId: entry.receiptId ?? null,
      source: entry.source ?? null,
      note: entry.note ?? null,
      meta: entry.meta ? (entry.meta as Prisma.InputJsonValue) : Prisma.DbNull,
      createdAt,
    },
    update: updateData,
  });
  return mapLedgerRecord(row);
}

export async function queryLedgerRecords(params: {
  page: number;
  pageSize: number;
  address: string;
}) {
  const { page, pageSize, address } = params;
  const total = await prisma.ledgerRecord.count({ where: { userAddress: address } });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(Math.max(page, 1), totalPages);
  const rows = await prisma.ledgerRecord.findMany({
    where: { userAddress: address },
    orderBy: { createdAt: "desc" },
    skip: (clampedPage - 1) * pageSize,
    take: pageSize,
  });
  return {
    items: rows.map(mapLedgerRecord),
    total,
    page: clampedPage,
    pageSize,
    totalPages,
  };
}
