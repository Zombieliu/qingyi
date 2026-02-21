import { NextResponse } from "next/server";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { queryMantouWithdraws, requestMantouWithdraw } from "@/lib/admin/admin-store";
import { requireUserAuth } from "@/lib/auth/user-auth";
import { z } from "zod";
import { parseBodyRaw } from "@/lib/shared/api-validation";

const withdrawSchema = z.object({
  address: z.string().min(1),
  amount: z.number().positive(),
  account: z.string().trim().min(1),
  note: z.string().trim().optional(),
});

export async function POST(req: Request) {
  const parsed = await parseBodyRaw(req, withdrawSchema);
  if (!parsed.success) return parsed.response;
  const { data: payload, rawBody } = parsed;

  const address = normalizeSuiAddress(payload.address);
  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: "invalid address" }, { status: 400 });
  }
  const auth = await requireUserAuth(req, {
    intent: "mantou:withdraw:create",
    address,
    body: rawBody,
  });
  if (!auth.ok) return auth.response;

  try {
    const result = await requestMantouWithdraw({
      address: auth.address,
      amount: payload.amount,
      account: payload.account,
      note: payload.note || undefined,
    });
    return NextResponse.json({ ok: true, request: result.request, wallet: result.wallet });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "withdraw failed" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = normalizeSuiAddress(searchParams.get("address") || "");
  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: "invalid address" }, { status: 400 });
  }
  const auth = await requireUserAuth(req, { intent: "mantou:withdraw:read", address });
  if (!auth.ok) return auth.response;
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize = Math.min(50, Math.max(5, Number(searchParams.get("pageSize") || "20")));
  const result = await queryMantouWithdraws({ page, pageSize, address: auth.address });
  return NextResponse.json(result);
}
