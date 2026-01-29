import { NextResponse } from "next/server";

const PING_HOST = "https://api.pingxx.com/v1/charges";

export async function POST(req: Request) {
  let payload: { amount: number; subject?: string; body?: string; channel?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { amount, subject = "钻石充值", body = "情谊电竞钻石充值", channel = "alipay_qr" } = payload;
  if (typeof amount !== "number" || amount <= 0) {
    return NextResponse.json({ error: "amount must be number" }, { status: 400 });
  }
  if (!process.env.PINGPP_API_KEY || !process.env.PINGPP_APP_ID) {
    return NextResponse.json({ error: "PINGPP_API_KEY or PINGPP_APP_ID not set" }, { status: 503 });
  }

  const orderNo = `QY${Date.now().toString().slice(-10)}`;
  const bodyParams = new URLSearchParams({
    amount: Math.round(amount * 100).toString(),
    app: process.env.PINGPP_APP_ID as string,
    channel,
    currency: "cny",
    order_no: orderNo,
    client_ip: "127.0.0.1",
    subject,
    body,
  });

  const auth = Buffer.from(`${process.env.PINGPP_API_KEY}:`).toString("base64");

  try {
    const res = await fetch(PING_HOST, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: bodyParams,
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: data?.error?.message || "ping++ error", details: data }, { status: 500 });
    }
    return NextResponse.json({ charge: data });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "ping++ request failed" }, { status: 500 });
  }
}
