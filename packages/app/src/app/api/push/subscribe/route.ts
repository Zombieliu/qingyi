import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/shared/api-validation";
import { savePushSubscription, removePushSubscription } from "@/lib/services/push-service";

const subscribeSchema = z.object({
  userAddress: z.string().min(1),
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }),
  }),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

export async function POST(req: Request) {
  const parsed = await parseBody(req, subscribeSchema);
  if (!parsed.success) return parsed.response;
  const { userAddress, subscription } = parsed.data;

  await savePushSubscription(userAddress, {
    endpoint: subscription.endpoint,
    keys: subscription.keys,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const parsed = await parseBody(req, unsubscribeSchema);
  if (!parsed.success) return parsed.response;
  await removePushSubscription(parsed.data.endpoint);
  return NextResponse.json({ ok: true });
}
