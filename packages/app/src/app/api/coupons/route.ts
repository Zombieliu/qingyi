import { NextResponse } from "next/server";
import { listActiveCoupons } from "@/lib/admin/admin-store";

export async function GET() {
  const coupons = await listActiveCoupons();
  return NextResponse.json(coupons);
}
