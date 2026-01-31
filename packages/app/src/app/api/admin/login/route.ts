import { NextResponse } from "next/server";
import { getAdminSecret } from "@/lib/admin-auth";

export async function POST(req: Request) {
  const secret = getAdminSecret();
  if (!secret) {
    return NextResponse.json({ error: "ADMIN_DASH_TOKEN 未配置" }, { status: 500 });
  }

  let body: { token?: string } = {};
  try {
    body = (await req.json()) as { token?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token = body.token?.trim();
  if (!token || token !== secret) {
    return NextResponse.json({ error: "密钥错误" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: "admin_token",
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return response;
}
