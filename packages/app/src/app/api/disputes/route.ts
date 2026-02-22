import { NextResponse } from "next/server";
import { requireUserAuth } from "@/lib/auth/user-auth";
import { createDispute, getDispute } from "@/lib/services/dispute-service";
import { parseBody } from "@/lib/shared/api-validation";
import { z } from "zod";

const createSchema = z.object({
  orderId: z.string().min(1),
  reason: z.enum(["service_quality", "no_show", "wrong_service", "overcharge", "other"]),
  description: z.string().min(10).max(1000),
  evidence: z.array(z.string().url()).max(5).optional(),
});

export async function POST(req: Request) {
  const address = req.headers.get("x-auth-address") || "";
  const auth = await requireUserAuth(req, { intent: "create_dispute", address });
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, createSchema);
  if (!body.success) return body.response;

  try {
    const dispute = await createDispute({
      ...body.data,
      userAddress: auth.address,
    });
    return NextResponse.json(dispute, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "创建争议失败";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function GET(req: Request) {
  const address = req.headers.get("x-auth-address") || "";
  const auth = await requireUserAuth(req, { intent: "get_dispute", address });
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get("orderId");
  if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });

  const dispute = await getDispute(orderId);
  if (!dispute) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json(dispute);
}
