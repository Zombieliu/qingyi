import { NextResponse } from "next/server";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { z } from "zod";
import { parseBodyRaw } from "@/lib/shared/api-validation";
import { env } from "@/lib/env";
import { creditLedgerWithAdmin } from "@/lib/ledger/ledger-credit";
import { apiBadRequest, apiUnauthorized, apiInternalError } from "@/lib/shared/api-response";

const ledgerCreditSchema = z.object({
  user: z.string().min(1),
  amount: z.union([z.string(), z.number()]),
  receiptId: z.string().trim().min(1),
  note: z.string().optional(),
  orderId: z.string().optional(),
  amountCny: z.number().optional(),
  currency: z.string().optional(),
  source: z.string().optional(),
});

function requireAuth(req: Request, token: string) {
  const header = req.headers.get("authorization") || "";
  const alt = req.headers.get("x-admin-token") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  return bearer === token || alt === token;
}

export async function POST(req: Request) {
  try {
    const adminToken = env.LEDGER_ADMIN_TOKEN;
    if (!adminToken) {
      throw new Error("Missing env: LEDGER_ADMIN_TOKEN");
    }

    if (!requireAuth(req, adminToken)) {
      return apiUnauthorized();
    }

    const parsed = await parseBodyRaw(req, ledgerCreditSchema);
    if (!parsed.success) return parsed.response;
    const { data: body } = parsed;

    const user = normalizeSuiAddress(body.user);
    if (!user || !isValidSuiAddress(user)) {
      return apiBadRequest("invalid user address");
    }
    const amountStr = String(body.amount).trim();
    if (!/^[0-9]+$/.test(amountStr) || amountStr === "0") {
      return apiBadRequest("amount must be positive integer");
    }

    const result = await creditLedgerWithAdmin({
      userAddress: user,
      amount: amountStr,
      receiptId: body.receiptId,
      orderId: body.orderId,
      note: body.note,
      amountCny: body.amountCny,
      currency: body.currency,
      source: body.source,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return apiInternalError(e);
  }
}
