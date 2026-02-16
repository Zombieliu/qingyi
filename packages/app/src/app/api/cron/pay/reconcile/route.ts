import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/db";
import { upsertLedgerRecord } from "@/lib/admin-store";
import { recordAudit } from "@/lib/admin-audit";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

function isAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  const vercelCron = req.headers.get("x-vercel-cron") === "1";
  if (vercelCron) return true;
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  const url = new URL(req.url);
  const token = req.headers.get("x-cron-secret") || url.searchParams.get("token") || "";
  return token === secret;
}

function parseNumber(value: string | null | undefined, fallback: number, min?: number, max?: number) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return fallback;
  const clampedMin = min !== undefined ? Math.max(raw, min) : raw;
  return max !== undefined ? Math.min(clampedMin, max) : clampedMin;
}

type StripeMeta = {
  userAddress?: string;
  diamondAmount?: number;
  amountCny?: number;
  currency?: string;
  paymentIntentId?: string;
  channel?: string;
};

function extractStripeMetaFromObject(data: Record<string, unknown> | null | undefined): StripeMeta {
  const metadata = (data?.metadata as Record<string, unknown> | undefined) || {};
  const userAddress = typeof metadata.userAddress === "string" ? metadata.userAddress : undefined;
  const diamondAmountRaw =
    typeof metadata.diamondAmount === "string" || typeof metadata.diamondAmount === "number"
      ? metadata.diamondAmount
      : undefined;
  const diamondAmount = diamondAmountRaw !== undefined ? Number(diamondAmountRaw) : NaN;
  const amountCents = typeof data?.amount === "number" ? data.amount : undefined;
  const currency = typeof data?.currency === "string" ? data.currency.toUpperCase() : undefined;
  const paymentIntentId = typeof data?.id === "string" ? data.id : undefined;
  const paymentTypes = Array.isArray(data?.payment_method_types) ? data?.payment_method_types : [];
  let channel: string | undefined;
  if (paymentTypes.includes("alipay")) channel = "alipay";
  if (paymentTypes.includes("wechat_pay")) channel = "wechat_pay";
  return {
    userAddress,
    diamondAmount: Number.isFinite(diamondAmount) ? Math.floor(diamondAmount) : undefined,
    amountCny: amountCents !== undefined ? Number((amountCents / 100).toFixed(2)) : undefined,
    currency,
    paymentIntentId,
    channel,
  };
}

function extractStripeMeta(raw: unknown): StripeMeta {
  const event = raw as Record<string, unknown> | null;
  const data = (event?.data as { object?: Record<string, unknown> } | undefined)?.object;
  return extractStripeMetaFromObject(data);
}

type StripeSuccessRecord = StripeMeta & { orderId: string; source: "event" | "stripe"; eventId?: string };

async function fetchStripeSuccessRecords(since: Date, limit: number): Promise<StripeSuccessRecord[]> {
  if (!stripe) return [];
  const results: StripeSuccessRecord[] = [];
  let startingAfter: string | undefined;
  let hasMore = true;
  const createdGte = Math.floor(since.getTime() / 1000);
  while (hasMore && results.length < limit) {
    const page = await stripe.paymentIntents.list({
      status: "succeeded",
      created: { gte: createdGte },
      limit: Math.min(100, limit - results.length),
      starting_after: startingAfter,
    });
    for (const intent of page.data) {
      const metadata = intent.metadata || {};
      const orderId = metadata.orderId || metadata.order_id;
      if (!orderId) continue;
      results.push({
        orderId,
        source: "stripe",
        ...extractStripeMetaFromObject(intent as unknown as Record<string, unknown>),
      });
    }
    hasMore = page.has_more;
    startingAfter = page.data.length ? page.data[page.data.length - 1].id : undefined;
  }
  return results;
}

function parseFlag(value: string | null | undefined, fallback: boolean) {
  if (value === null || value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "on", "yes"].includes(normalized)) return true;
  if (["0", "false", "off", "no"].includes(normalized)) return false;
  return fallback;
}

function buildAlertMarkdown(params: {
  apply: boolean;
  sinceHours: number;
  pendingHours: number;
  scannedEvents: number;
  stripeRecords: number;
  stripeError?: string | null;
  missingLedger: number;
  patchedLedger: number;
  stalePending: number;
  sample: { missingLedger: string[]; patchedLedger: string[]; stalePending: string[] };
}) {
  const now = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(Date.now());
  const lines = [
    "⚠️ <font color=\"warning\">支付对账告警</font>",
    `> 时间：${now}`,
    `> apply：${params.apply ? "是" : "否"}  窗口：${params.sinceHours}h  pending：${params.pendingHours}h`,
    `> Stripe 事件：${params.scannedEvents}  Stripe 列表：${params.stripeRecords}`,
    params.stripeError ? `> Stripe 错误：${params.stripeError}` : null,
    `> 缺失账本：${params.missingLedger}  修复状态：${params.patchedLedger}  过期 pending：${params.stalePending}`,
  ];
  if (params.sample.missingLedger.length) {
    lines.push(`> 缺失样例：${params.sample.missingLedger.slice(0, 5).join(", ")}`);
  }
  if (params.sample.patchedLedger.length) {
    lines.push(`> 修复样例：${params.sample.patchedLedger.slice(0, 5).join(", ")}`);
  }
  if (params.sample.stalePending.length) {
    lines.push(`> pending 样例：${params.sample.stalePending.slice(0, 5).join(", ")}`);
  }
  return lines.filter(Boolean).join("\n");
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const apply = url.searchParams.get("apply") === "1";
  const useStripe = parseFlag(
    url.searchParams.get("useStripe"),
    parseFlag(process.env.PAYMENT_RECONCILE_USE_STRIPE, Boolean(stripe))
  );
  const sinceHours = parseNumber(url.searchParams.get("sinceHours"), 48, 1, 720);
  const limit = parseNumber(url.searchParams.get("limit"), 200, 1, 1000);
  const pendingHours = parseNumber(url.searchParams.get("pendingHours"), 6, 1, 168);
  const alertEnabled = parseFlag(
    url.searchParams.get("alert"),
    parseFlag(process.env.PAYMENT_RECONCILE_ALERT_ENABLED, true)
  );
  const missingThreshold = parseNumber(
    url.searchParams.get("missingThreshold"),
    Number(process.env.PAYMENT_RECONCILE_MISSING_THRESHOLD || "1"),
    0,
    10000
  );
  const patchedThreshold = parseNumber(
    url.searchParams.get("patchedThreshold"),
    Number(process.env.PAYMENT_RECONCILE_PATCHED_THRESHOLD || "1"),
    0,
    10000
  );
  const pendingThreshold = parseNumber(
    url.searchParams.get("pendingThreshold"),
    Number(process.env.PAYMENT_RECONCILE_PENDING_THRESHOLD || "5"),
    0,
    10000
  );
  const now = Date.now();
  const since = new Date(now - sinceHours * 60 * 60 * 1000);
  const pendingBefore = new Date(now - pendingHours * 60 * 60 * 1000);

  const events = await prisma.adminPaymentEvent.findMany({
    where: {
      provider: "stripe",
      event: "payment_intent.succeeded",
      orderNo: { not: null },
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const successMap = new Map<string, StripeSuccessRecord>();
  for (const event of events) {
    const orderId = event.orderNo || "";
    if (!orderId) continue;
    const meta = extractStripeMeta(event.raw);
    successMap.set(orderId, {
      orderId,
      source: "event",
      eventId: event.id,
      ...meta,
    });
  }

  let stripeRecords: StripeSuccessRecord[] = [];
  let stripeError: string | null = null;
  if (useStripe && !stripe) {
    stripeError = "stripe_secret_missing";
  }
  if (useStripe && stripe) {
    try {
      stripeRecords = await fetchStripeSuccessRecords(since, limit);
      for (const record of stripeRecords) {
        const existing = successMap.get(record.orderId);
        if (!existing) {
          successMap.set(record.orderId, record);
          continue;
        }
        if (!existing.userAddress && record.userAddress) existing.userAddress = record.userAddress;
        if (!existing.diamondAmount && record.diamondAmount) existing.diamondAmount = record.diamondAmount;
        if (!existing.amountCny && record.amountCny) existing.amountCny = record.amountCny;
        if (!existing.currency && record.currency) existing.currency = record.currency;
        if (!existing.channel && record.channel) existing.channel = record.channel;
        if (!existing.paymentIntentId && record.paymentIntentId) existing.paymentIntentId = record.paymentIntentId;
      }
    } catch (error) {
      stripeError = (error as Error).message || "stripe_list_failed";
    }
  }

  const orderNos = Array.from(successMap.keys());
  const ledgerRows = orderNos.length
    ? await prisma.ledgerRecord.findMany({
        where: {
          OR: [{ id: { in: orderNos } }, { orderId: { in: orderNos } }],
        },
      })
    : [];
  const ledgerById = new Map(ledgerRows.map((row) => [row.id, row]));
  const ledgerByOrderId = new Map(
    ledgerRows.filter((row) => row.orderId).map((row) => [row.orderId as string, row])
  );

  const missingLedger: string[] = [];
  const patchedLedger: string[] = [];
  const skipped: Array<{ orderId: string; reason: string }> = [];
  const reconciled: string[] = [];

  for (const [orderId, record] of successMap.entries()) {
    if (!orderId) continue;
    const existing = ledgerById.get(orderId) || ledgerByOrderId.get(orderId);
    if (!existing) {
      missingLedger.push(orderId);
      if (!apply) continue;
      if (!record.userAddress || !record.diamondAmount) {
        skipped.push({ orderId, reason: "missing metadata" });
        continue;
      }
      await upsertLedgerRecord({
        id: orderId,
        userAddress: record.userAddress,
        diamondAmount: record.diamondAmount,
        amount: record.amountCny,
        currency: record.currency || "CNY",
        channel: record.channel || "stripe",
        status: "paid",
        orderId,
        receiptId: record.paymentIntentId ? `stripe_pi_${record.paymentIntentId}` : undefined,
        source: "stripe",
        note: "reconciled_from_event",
        meta: {
          reconciledAt: now,
          reconcileSource: record.source,
          eventId: record.eventId,
          paymentIntentId: record.paymentIntentId,
        },
      });
      reconciled.push(orderId);
      continue;
    }
    if (existing.status !== "paid" && existing.status !== "credited") {
      patchedLedger.push(orderId);
      if (!apply) continue;
      const existingMeta =
        existing.meta && typeof existing.meta === "object" ? (existing.meta as Record<string, unknown>) : {};
      await prisma.ledgerRecord.update({
        where: { id: existing.id },
        data: {
          status: "paid",
          updatedAt: new Date(now),
          note: existing.note || "reconciled_from_event",
          meta: {
            ...existingMeta,
            reconciledAt: now,
            reconcileSource: record.source,
            eventId: record.eventId,
          } as Record<string, unknown>,
        },
      });
      reconciled.push(orderId);
    }
  }

  const stalePendingRows = await prisma.ledgerRecord.findMany({
    where: {
      status: "pending",
      createdAt: { lt: pendingBefore },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  const successOrders = new Set(orderNos);
  const stalePending = stalePendingRows
    .filter((row) => !successOrders.has(row.id) && (!row.orderId || !successOrders.has(row.orderId)))
    .map((row) => row.id);

  const alertWebhook =
    process.env.PAYMENT_RECONCILE_ALERT_WEBHOOK_URL || process.env.WECHAT_WEBHOOK_URL || "";
  const alertReasons: string[] = [];
  if (missingThreshold >= 0 && missingLedger.length >= missingThreshold && missingLedger.length > 0) {
    alertReasons.push("missing_ledger");
  }
  if (patchedThreshold >= 0 && patchedLedger.length >= patchedThreshold && patchedLedger.length > 0) {
    alertReasons.push("patched_ledger");
  }
  if (pendingThreshold >= 0 && stalePending.length >= pendingThreshold && stalePending.length > 0) {
    alertReasons.push("stale_pending");
  }
  if (stripeError) {
    alertReasons.push("stripe_error");
  }
  const shouldAlert = alertEnabled && alertReasons.length > 0 && Boolean(alertWebhook);
  let alertSent = false;
  let alertError: string | null = null;
  if (shouldAlert) {
    try {
      const markdown = buildAlertMarkdown({
        apply,
        sinceHours,
        pendingHours,
        scannedEvents: events.length,
        stripeRecords: stripeRecords.length,
        stripeError,
        missingLedger: missingLedger.length,
        patchedLedger: patchedLedger.length,
        stalePending: stalePending.length,
        sample: {
          missingLedger: missingLedger.slice(0, 10),
          patchedLedger: patchedLedger.slice(0, 10),
          stalePending: stalePending.slice(0, 10),
        },
      });
      const res = await fetch(alertWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ msgtype: "markdown", markdown: { content: markdown } }),
      });
      alertSent = res.ok;
      if (!res.ok) {
        alertError = `alert webhook failed: ${res.status}`;
      }
    } catch (error) {
      alertError = (error as Error).message || "alert webhook failed";
    }
  }

  const summary = {
    ok: true,
    apply,
    sinceHours,
    pendingHours,
    scannedEvents: events.length,
    stripeRecords: stripeRecords.length,
    stripeEnabled: useStripe,
    stripeError,
    uniqueOrders: orderNos.length,
    missingLedger: missingLedger.length,
    patchedLedger: patchedLedger.length,
    reconciled: reconciled.length,
    skipped: skipped.length,
    stalePending: stalePending.length,
    thresholds: {
      missingThreshold,
      patchedThreshold,
      pendingThreshold,
    },
    alertEnabled,
    alertWebhookConfigured: Boolean(alertWebhook),
    alertSent,
    alertReasons,
    alertError,
    sample: {
      missingLedger: missingLedger.slice(0, 10),
      patchedLedger: patchedLedger.slice(0, 10),
      stalePending: stalePending.slice(0, 10),
      skipped,
    },
  };

  const hasIssues = missingLedger.length > 0 || patchedLedger.length > 0 || stalePending.length > 0;
  await recordAudit(req, { role: "finance", authType: "cron" }, "payments.reconcile", "payment", undefined, {
    ...summary,
    hasIssues,
  });

  return NextResponse.json(summary);
}
