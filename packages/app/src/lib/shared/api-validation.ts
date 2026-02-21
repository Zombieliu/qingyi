import { NextResponse } from "next/server";
import type { ZodType } from "zod";

type ParseSuccess<T> = { success: true; data: T };
type ParseFailure = { success: false; response: NextResponse };

export async function parseBody<T>(
  req: Request,
  schema: ZodType<T>
): Promise<ParseSuccess<T> | ParseFailure> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      success: false,
      response: NextResponse.json({ error: "Invalid JSON" }, { status: 400 }),
    };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const message = result.error.issues.map((i) => i.message).join("; ");
    return { success: false, response: NextResponse.json({ error: message }, { status: 400 }) };
  }
  return { success: true, data: result.data };
}

type ParseRawSuccess<T> = { success: true; data: T; rawBody: string };

export async function parseBodyRaw<T>(
  req: Request,
  schema: ZodType<T>
): Promise<ParseRawSuccess<T> | ParseFailure> {
  let text: string;
  try {
    text = await req.text();
  } catch {
    return {
      success: false,
      response: NextResponse.json({ error: "Failed to read body" }, { status: 400 }),
    };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return {
      success: false,
      response: NextResponse.json({ error: "Invalid JSON" }, { status: 400 }),
    };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const message = result.error.issues.map((i) => i.message).join("; ");
    return { success: false, response: NextResponse.json({ error: message }, { status: 400 }) };
  }
  return { success: true, data: result.data, rawBody: text };
}
