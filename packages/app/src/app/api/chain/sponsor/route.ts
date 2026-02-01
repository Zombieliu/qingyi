import { NextResponse } from "next/server";
import { buildSponsoredTransactionFromKind, executeSponsoredTransaction } from "@/lib/chain-sponsor";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const payload = body as {
    step?: "prepare" | "execute";
    sender?: string;
    kindBytes?: string;
    txBytes?: string;
    userSignature?: string;
  };

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
      return NextResponse.json({ error: "txBytes and userSignature are required" }, { status: 400 });
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
