import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBodyRaw } from "@/lib/shared/api-validation";
import { requireUserAuth } from "@/lib/auth/user-auth";
import { redeemCodeForUser } from "@/lib/redeem/redeem-service";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";

const redeemSchema = z.object({
  address: z.string().min(1),
  code: z.string().min(1),
});

function getClientIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") || undefined;
}

export async function POST(req: Request) {
  const parsed = await parseBodyRaw(req, redeemSchema);
  if (!parsed.success) return parsed.response;
  const { data: body, rawBody } = parsed;

  const address = normalizeSuiAddress(body.address);
  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: "invalid address" }, { status: 400 });
  }

  const auth = await requireUserAuth(req, {
    intent: `redeem:${body.code}`,
    address,
    body: rawBody,
  });
  if (!auth.ok) return auth.response;

  const result = await redeemCodeForUser({
    address: auth.address,
    code: body.code,
    ip: getClientIp(req),
    userAgent: req.headers.get("user-agent") || undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
