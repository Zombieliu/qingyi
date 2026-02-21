import { NextResponse } from "next/server";
import { z } from "zod";
import {
  buildSponsoredTransactionFromKind,
  executeSponsoredTransaction,
} from "@/lib/chain/chain-sponsor";
import { parseBody } from "@/lib/shared/api-validation";

const postSchema = z.object({
  step: z.enum(["prepare", "execute"]),
  sender: z.string().optional(),
  kindBytes: z.string().optional(),
  txBytes: z.string().optional(),
  userSignature: z.string().optional(),
});

export async function POST(req: Request) {
  const parsed = await parseBody(req, postSchema);
  if (!parsed.success) return parsed.response;
  const payload = parsed.data;

  if (payload.step === "prepare") {
    if (!payload.sender || !payload.kindBytes) {
      return NextResponse.json({ error: "sender and kindBytes are required" }, { status: 400 });
    }
    try {
      const result = await buildSponsoredTransactionFromKind({
        sender: payload.sender,
        kindBytes: payload.kindBytes,
      });
      return NextResponse.json(result);
    } catch (error) {
      return NextResponse.json({ error: (error as Error).message }, { status: 400 });
    }
  }

  if (payload.step === "execute") {
    if (!payload.txBytes || !payload.userSignature) {
      return NextResponse.json(
        { error: "txBytes and userSignature are required" },
        { status: 400 }
      );
    }
    try {
      const result = await executeSponsoredTransaction({
        txBytes: payload.txBytes,
        userSignature: payload.userSignature,
      });
      return NextResponse.json(result);
    } catch (error) {
      return NextResponse.json({ error: (error as Error).message }, { status: 400 });
    }
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}
