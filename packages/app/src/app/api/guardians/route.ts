import { NextResponse } from "next/server";
import crypto from "crypto";
import { addGuardianApplication } from "@/lib/admin-store";
import type { AdminGuardianApplication, GuardianStatus } from "@/lib/admin-types";

export async function POST(req: Request) {
  let body: {
    name?: string;
    contact?: string;
    games?: string;
    experience?: string;
    availability?: string;
    note?: string;
    userAddress?: string;
  } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.name?.trim() || !body.contact?.trim()) {
    return NextResponse.json({ error: "name and contact required" }, { status: 400 });
  }

  const application: AdminGuardianApplication = {
    id: `GUA-${Date.now()}-${crypto.randomInt(1000, 9999)}`,
    user: body.name.trim(),
    userAddress: body.userAddress,
    contact: body.contact.trim(),
    games: body.games?.trim(),
    experience: body.experience?.trim(),
    availability: body.availability?.trim(),
    note: body.note?.trim(),
    status: "待审核" as GuardianStatus,
    createdAt: Date.now(),
  };

  await addGuardianApplication(application);
  return NextResponse.json({ id: application.id, status: application.status });
}
