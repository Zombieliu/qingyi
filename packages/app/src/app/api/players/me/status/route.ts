import { NextResponse } from "next/server";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { requireUserAuth } from "@/lib/auth/user-auth";
import { PLAYER_STATUS_OPTIONS, type PlayerStatus } from "@/lib/admin/admin-types";
import { getPlayerByAddress, updatePlayerStatusByAddress } from "@/lib/admin/admin-store";
import { recordAudit } from "@/lib/admin/admin-audit";

function normalizeAddress(raw?: string | null) {
  const address = normalizeSuiAddress(raw || "");
  if (!address || !isValidSuiAddress(address)) {
    return "";
  }
  return address;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = normalizeAddress(searchParams.get("address"));
  if (!address) {
    return NextResponse.json({ error: "invalid_address" }, { status: 400 });
  }
  const auth = await requireUserAuth(req, { intent: "players:status:read", address });
  if (!auth.ok) return auth.response;

  const result = await getPlayerByAddress(address);
  if (result.conflict) {
    return NextResponse.json({ error: "address_conflict" }, { status: 409 });
  }
  if (!result.player) {
    return NextResponse.json({ error: "player_not_found" }, { status: 404 });
  }
  return NextResponse.json({
    id: result.player.id,
    status: result.player.status,
  });
}

export async function PATCH(req: Request) {
  let rawBody = "";
  let payload: { address?: string; status?: PlayerStatus } = {};
  try {
    rawBody = await req.text();
    payload = rawBody ? (JSON.parse(rawBody) as typeof payload) : {};
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const address = normalizeAddress(payload.address);
  if (!address) {
    return NextResponse.json({ error: "invalid_address" }, { status: 400 });
  }
  const status = payload.status;
  if (!status || !PLAYER_STATUS_OPTIONS.includes(status)) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }

  const auth = await requireUserAuth(req, {
    intent: "players:status:update",
    address,
    body: rawBody || undefined,
  });
  if (!auth.ok) return auth.response;

  const current = await getPlayerByAddress(address);
  if (current.conflict) {
    return NextResponse.json({ error: "address_conflict" }, { status: 409 });
  }
  if (!current.player) {
    return NextResponse.json({ error: "player_not_found" }, { status: 404 });
  }
  if (current.player.status === "停用") {
    return NextResponse.json({ error: "player_disabled" }, { status: 403 });
  }

  const result = await updatePlayerStatusByAddress(address, status);
  if (result.conflict) {
    return NextResponse.json({ error: "address_conflict" }, { status: 409 });
  }
  if (!result.player) {
    return NextResponse.json({ error: "player_not_found" }, { status: 404 });
  }

  await recordAudit(
    req,
    { role: "viewer", authType: "guardian" },
    "players.self_status",
    "player",
    result.player.id,
    { address, status }
  );

  return NextResponse.json({ id: result.player.id, status: result.player.status });
}
