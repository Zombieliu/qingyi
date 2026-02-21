import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { creditMantou } from "@/lib/admin/admin-store";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { parseBody } from "@/lib/shared/api-validation";

const postSchema = z.object({
  address: z.string().min(1),
  amount: z.number().int().positive(),
  note: z.string().trim().optional(),
});

export async function POST(req: Request) {
  const auth = await requireAdmin(req, { role: "finance" });
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(req, postSchema);
  if (!parsed.success) return parsed.response;
  const body = parsed.data;

  const address = normalizeSuiAddress(body.address);
  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: "invalid address" }, { status: 400 });
  }

  try {
    const result = await creditMantou({
      address,
      amount: body.amount,
      orderId: `seed-${Date.now()}`,
      note: body.note || "e2e seed",
    });
    return NextResponse.json({ ok: true, wallet: result.wallet });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "seed failed" }, { status: 500 });
  }
}
