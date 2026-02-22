import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/admin-auth";
import {
  getAllFlagsAsync,
  setFlagOverride,
  clearFlagOverride,
  type FeatureFlag,
} from "@/lib/feature-flags";

export async function GET(req: Request) {
  const auth = await requireAdmin(req, { role: "viewer" });
  if (!auth.ok) return auth.response;
  const flags = await getAllFlagsAsync();
  return NextResponse.json({ flags });
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req, { role: "admin" });
  if (!auth.ok) return auth.response;

  try {
    const { flag, enabled, clear } = await req.json();
    if (!flag) return NextResponse.json({ error: "flag required" }, { status: 400 });

    if (clear) {
      await clearFlagOverride(flag as FeatureFlag);
    } else if (typeof enabled === "boolean") {
      await setFlagOverride(flag as FeatureFlag, enabled);
    } else {
      return NextResponse.json({ error: "enabled (boolean) or clear required" }, { status: 400 });
    }

    const flags = await getAllFlagsAsync();
    return NextResponse.json({ flags });
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
}
