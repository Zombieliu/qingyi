import "server-only";

import { fetchEdgeRows, getEdgeDbConfig, insertEdgeRow, toNumber } from "@/lib/edge-db/client";
import { toEdgeDate } from "@/lib/edge-db/date-normalization";

type PaymentEventRow = {
  id: string;
  orderNo: string | null;
  raw: unknown;
  createdAt: string | number | null;
  status: string | null;
};

type LedgerRow = {
  id: string;
  orderId: string | null;
  status: string;
  meta: unknown;
  note: string | null;
  createdAt: string | number | null;
};

function getRestBaseUrl(baseUrl: string): string {
  if (baseUrl.endsWith("/rest/v1")) return baseUrl;
  return `${baseUrl}/rest/v1`;
}

async function parseEdgeErrorDetail(res: Response): Promise<string> {
  const text = (await res.text().catch(() => "")).slice(0, 240);
  return text || "unknown";
}

async function patchEdgeRowsByFilter(
  table: string,
  filter: URLSearchParams,
  data: Record<string, unknown>
) {
  const config = getEdgeDbConfig("write");
  if (!config) {
    throw new Error("edge_db_not_configured");
  }

  const url = new URL(`${getRestBaseUrl(config.baseUrl)}/${table}`);
  url.search = filter.toString();

  const res = await fetch(url.toString(), {
    method: "PATCH",
    headers: {
      apikey: config.apiKey,
      authorization: `Bearer ${config.apiKey}`,
      accept: "application/json",
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify(data),
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await parseEdgeErrorDetail(res);
    throw new Error(`edge_db_request_failed:${table}:${res.status}:${detail}`);
  }
}

export type StripeSuccessEventEdgeRead = {
  id: string;
  orderNo: string;
  raw: unknown;
  createdAt: Date;
  status: string | null;
};

export type ReconcileLedgerRowEdgeRead = {
  id: string;
  orderId: string | null;
  status: string;
  meta: unknown;
  note: string | null;
  createdAt: Date;
};

export async function listStripeSucceededPaymentEventsEdgeRead(
  since: Date,
  limit: number
): Promise<StripeSuccessEventEdgeRead[]> {
  const rows = await fetchEdgeRows<PaymentEventRow>(
    "AdminPaymentEvent",
    new URLSearchParams({
      select: "id,orderNo,raw,createdAt,status",
      provider: "eq.stripe",
      event: "eq.payment_intent.succeeded",
      orderNo: "not.is.null",
      createdAt: `gte.${since.toISOString()}`,
      order: "createdAt.desc",
      limit: String(limit),
    })
  );

  return rows
    .filter(
      (row): row is PaymentEventRow & { orderNo: string } =>
        typeof row.orderNo === "string" && row.orderNo.length > 0
    )
    .map((row) => ({
      id: row.id,
      orderNo: row.orderNo,
      raw: row.raw,
      createdAt: toEdgeDate(row.createdAt),
      status: row.status,
    }));
}

export async function listLedgerRecordsByOrderIdsEdgeRead(
  orderIds: string[]
): Promise<ReconcileLedgerRowEdgeRead[]> {
  if (!orderIds.length) return [];

  const unique = Array.from(new Set(orderIds));
  const chunkSize = 100;
  const byId = new Map<string, ReconcileLedgerRowEdgeRead>();

  for (let index = 0; index < unique.length; index += chunkSize) {
    const chunk = unique.slice(index, index + chunkSize);
    const inClause = `(${chunk.join(",")})`;
    const rows = await fetchEdgeRows<LedgerRow>(
      "LedgerRecord",
      new URLSearchParams({
        select: "id,orderId,status,meta,note,createdAt",
        or: `(id.in.${inClause},orderId.in.${inClause})`,
      })
    );

    for (const row of rows) {
      byId.set(row.id, {
        id: row.id,
        orderId: row.orderId,
        status: row.status,
        meta: row.meta,
        note: row.note,
        createdAt: toEdgeDate(row.createdAt),
      });
    }
  }

  return Array.from(byId.values());
}

export async function listPendingLedgerRowsBeforeEdgeRead(
  pendingBefore: Date,
  limit: number
): Promise<ReconcileLedgerRowEdgeRead[]> {
  const rows = await fetchEdgeRows<LedgerRow>(
    "LedgerRecord",
    new URLSearchParams({
      select: "id,orderId,status,meta,note,createdAt",
      status: "eq.pending",
      createdAt: `lt.${pendingBefore.toISOString()}`,
      order: "createdAt.asc",
      limit: String(limit),
    })
  );

  return rows.map((row) => ({
    id: row.id,
    orderId: row.orderId,
    status: row.status,
    meta: row.meta,
    note: row.note,
    createdAt: toEdgeDate(row.createdAt),
  }));
}

export async function createPaymentEventEdgeWrite(entry: {
  id: string;
  provider: string;
  event: string;
  orderNo?: string;
  amount?: number;
  status?: string;
  verified: boolean;
  createdAt: number;
  raw?: Record<string, unknown>;
}): Promise<void> {
  await insertEdgeRow("AdminPaymentEvent", {
    id: entry.id,
    provider: entry.provider,
    event: entry.event,
    orderNo: entry.orderNo ?? null,
    amount: entry.amount ?? null,
    status: entry.status ?? null,
    verified: entry.verified,
    createdAt: new Date(entry.createdAt).toISOString(),
    raw: entry.raw ?? null,
  });
}

export async function getOrderExistsByIdEdgeRead(orderId: string): Promise<boolean> {
  const rows = await fetchEdgeRows<{ id: string }>(
    "AdminOrder",
    new URLSearchParams({ select: "id", id: `eq.${orderId}`, limit: "1" })
  );
  return rows.length > 0;
}

export async function updateOrderPaymentStatusEdgeWrite(
  orderId: string,
  paymentStatus: string
): Promise<void> {
  await patchEdgeRowsByFilter("AdminOrder", new URLSearchParams({ id: `eq.${orderId}` }), {
    paymentStatus,
    updatedAt: new Date().toISOString(),
  });
}

export async function upsertLedgerRecordEdgeWrite(entry: {
  id: string;
  userAddress: string;
  diamondAmount: number;
  amount?: number;
  currency?: string;
  channel?: string;
  status: string;
  orderId?: string;
  receiptId?: string;
  source?: string;
  note?: string;
  meta?: Record<string, unknown>;
  createdAt?: number;
}): Promise<void> {
  const existing = await fetchEdgeRows<{ id: string }>(
    "LedgerRecord",
    new URLSearchParams({ select: "id", id: `eq.${entry.id}`, limit: "1" }),
    "write"
  );

  if (existing.length > 0) {
    const patch: Record<string, unknown> = {
      userAddress: entry.userAddress,
      diamondAmount: entry.diamondAmount,
      status: entry.status,
      updatedAt: new Date().toISOString(),
    };
    if (entry.amount !== undefined) patch.amount = entry.amount;
    if (entry.currency !== undefined) patch.currency = entry.currency;
    if (entry.channel !== undefined) patch.channel = entry.channel;
    if (entry.orderId !== undefined) patch.orderId = entry.orderId;
    if (entry.receiptId !== undefined) patch.receiptId = entry.receiptId;
    if (entry.source !== undefined) patch.source = entry.source;
    if (entry.note !== undefined) patch.note = entry.note;
    if (entry.meta !== undefined) patch.meta = entry.meta;
    await patchEdgeRowsByFilter(
      "LedgerRecord",
      new URLSearchParams({ id: `eq.${entry.id}` }),
      patch
    );
    return;
  }

  await insertEdgeRow("LedgerRecord", {
    id: entry.id,
    userAddress: entry.userAddress,
    diamondAmount: Math.floor(entry.diamondAmount),
    amount: entry.amount ?? null,
    currency: entry.currency ?? null,
    channel: entry.channel ?? null,
    status: entry.status,
    orderId: entry.orderId ?? null,
    receiptId: entry.receiptId ?? null,
    source: entry.source ?? null,
    note: entry.note ?? null,
    meta: entry.meta ?? null,
    createdAt: new Date(entry.createdAt ?? Date.now()).toISOString(),
  });
}

export async function markLedgerRecordPaidEdgeWrite(args: {
  id: string;
  note: string;
  meta: Record<string, unknown>;
  updatedAt: Date;
}): Promise<void> {
  await patchEdgeRowsByFilter("LedgerRecord", new URLSearchParams({ id: `eq.${args.id}` }), {
    status: "paid",
    updatedAt: args.updatedAt.toISOString(),
    note: args.note,
    meta: args.meta,
  });
}

export function mapLedgerAmount(value: string | number | null): number {
  return toNumber(value);
}
