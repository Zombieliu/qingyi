import { NextResponse } from "next/server";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { bindReferral } from "@/lib/admin/admin-store";
import { requireUserAuth } from "@/lib/auth/user-auth";

export async function POST(req: Request) {
  let payload: { inviteeAddress?: string; refCode?: string } = {};
  try {
    payload = (await req.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const inviteeAddress = normalizeSuiAddress(payload.inviteeAddress || "");
  if (!inviteeAddress || !isValidSuiAddress(inviteeAddress)) {
    return NextResponse.json({ error: "invalid inviteeAddress" }, { status: 400 });
  }

  const refCode = (payload.refCode || "").trim().toLowerCase();
  if (!refCode || refCode.length < 6) {
    return NextResponse.json({ error: "invalid refCode" }, { status: 400 });
  }

  const auth = await requireUserAuth(req, { intent: "referral:bind", address: inviteeAddress });
  if (!auth.ok) return auth.response;

  // refCode is last 8 chars of inviter's address — find by suffix match
  // Since Sui addresses are hex, the refCode maps to the inviter address suffix
  // We store the full inviter address; the client resolves refCode → address
  // For simplicity, we accept the inviter address directly if provided
  // The refCode is the last 8 hex chars of the Sui address (without 0x prefix)
  const inviterAddress = normalizeSuiAddress("0x" + "0".repeat(62 - refCode.length) + refCode);

  // Validate: refCode must map to a plausible address and not be self
  if (!isValidSuiAddress(inviterAddress)) {
    return NextResponse.json({ error: "invalid refCode" }, { status: 400 });
  }
  if (inviterAddress === inviteeAddress) {
    return NextResponse.json({ error: "cannot_self_refer" }, { status: 400 });
  }

  try {
    const result = await bindReferral(inviterAddress, inviteeAddress);
    return NextResponse.json({ ok: true, duplicated: result.duplicated, referral: result.referral });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "bind failed" }, { status: 500 });
  }
}
