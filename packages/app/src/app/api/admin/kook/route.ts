import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { isKookEnabled, sendChannelMessage } from "@/lib/services/kook-service";

/** GET: Check Kook integration status */
export async function GET(req: Request) {
  const auth = await requireAdmin(req, { role: "admin" });
  if (!auth.ok) return auth.response;

  return NextResponse.json({
    enabled: isKookEnabled(),
    configured: !!process.env.KOOK_BOT_TOKEN,
    channelId: process.env.KOOK_CHANNEL_ID ? "***" + process.env.KOOK_CHANNEL_ID.slice(-4) : null,
  });
}

/** POST: Send a test message to Kook */
export async function POST(req: Request) {
  const auth = await requireAdmin(req, { role: "admin" });
  if (!auth.ok) return auth.response;

  if (!isKookEnabled()) {
    return NextResponse.json({ error: "Kook not configured" }, { status: 400 });
  }

  try {
    const { message, channelId } = await req.json();
    const result = await sendChannelMessage({
      content: message || "🔔 情谊电竞测试消息",
      channelId,
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "send failed" }, { status: 500 });
  }
}
