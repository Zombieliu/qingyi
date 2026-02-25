import { NextResponse } from "next/server";
import { z } from "zod";
import {
  buildSponsoredTransactionFromKind,
  executeSponsoredTransaction,
} from "@/lib/chain/chain-sponsor";
import { parseBody } from "@/lib/shared/api-validation";
import { apiBadRequest } from "@/lib/shared/api-response";

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
      return apiBadRequest("sender and kindBytes are required");
    }
    try {
      const result = await buildSponsoredTransactionFromKind({
        sender: payload.sender,
        kindBytes: payload.kindBytes,
      });
      return NextResponse.json(result);
    } catch (error) {
      return apiBadRequest((error as Error).message);
    }
  }

  if (payload.step === "execute") {
    if (!payload.txBytes || !payload.userSignature) {
      return apiBadRequest("txBytes and userSignature are required");
    }
    try {
      const result = await executeSponsoredTransaction({
        txBytes: payload.txBytes,
        userSignature: payload.userSignature,
      });
      return NextResponse.json(result);
    } catch (error) {
      return apiBadRequest((error as Error).message);
    }
  }

  return apiBadRequest("Invalid request");
}
