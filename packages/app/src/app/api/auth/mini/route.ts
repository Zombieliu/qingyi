import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { parseBodyRaw } from "@/lib/shared/api-validation";
import { prisma } from "@/lib/db";
import {
  createUserSession,
  getUserSessionFromToken,
  requireUserSignature,
} from "@/lib/auth/user-auth";
import { getClientIp } from "@/lib/shared/api-utils";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";

const miniSchema = z.object({
  platform: z.enum(["wechat", "alipay", "douyin"]),
  code: z.string().min(1),
  address: z.string().optional(),
  openid: z.string().optional(),
  unionid: z.string().optional(),
  phone: z.string().optional(),
});

type MiniPlatform = z.infer<typeof miniSchema>["platform"];

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

function buildMockId(platform: MiniPlatform, code: string, label: string) {
  const hash = crypto.createHash("sha256").update(`${platform}:${label}:${code}`).digest("hex");
  return `mock_${platform}_${label}_${hash.slice(0, 24)}`;
}

function buildMockSessionKey(platform: MiniPlatform, code: string) {
  const hash = crypto.createHash("sha256").update(`${platform}:session:${code}`).digest("hex");
  return `mock_session_${hash.slice(0, 32)}`;
}

export async function POST(req: Request) {
  const parsed = await parseBodyRaw(req, miniSchema);
  if (!parsed.success) return parsed.response;
  const { data: payload, rawBody } = parsed;

  const platform = payload.platform;
  const openid = payload.openid?.trim() || buildMockId(platform, payload.code, "openid");
  const unionid = payload.unionid?.trim() || buildMockId(platform, payload.code, "unionid");
  const sessionKey = buildMockSessionKey(platform, payload.code);
  const now = new Date();

  const existing = await prisma.miniProgramAccount.findUnique({
    where: { platform_openid: { platform, openid } },
  });

  if (existing?.userAddress) {
    const boundAddress = normalizeSuiAddress(existing.userAddress);
    if (payload.address) {
      const normalizedPayload = normalizeSuiAddress(payload.address);
      if (normalizedPayload !== boundAddress) {
        return NextResponse.json({ error: "address_mismatch" }, { status: 409 });
      }
    }
    const account = await prisma.miniProgramAccount.update({
      where: { platform_openid: { platform, openid } },
      data: {
        unionid,
        sessionKey,
        phone: payload.phone ?? undefined,
        lastLoginAt: now,
        updatedAt: now,
      },
    });
    const { token, session } = await createUserSession({
      address: boundAddress,
      ip: getClientIp(req),
      userAgent: req.headers.get("user-agent") || undefined,
    });
    return NextResponse.json({
      ok: true,
      platform,
      openid: account.openid,
      unionid: account.unionid,
      address: account.userAddress,
      token,
      expiresAt: session.expiresAt,
      mock: true,
    });
  }

  let bindAddress = payload.address?.trim() || "";
  const bearerToken = getBearerToken(req);
  const bearerSession = bearerToken ? await getUserSessionFromToken(bearerToken) : null;
  if (!bindAddress && bearerSession) {
    bindAddress = bearerSession.address;
  }

  if (!bindAddress) {
    return NextResponse.json(
      { error: "binding_required", platform, openid, unionid },
      { status: 409 }
    );
  }

  const normalizedAddress = normalizeSuiAddress(bindAddress);
  if (!normalizedAddress || !isValidSuiAddress(normalizedAddress)) {
    return NextResponse.json({ error: "invalid_address" }, { status: 400 });
  }

  if (bearerSession) {
    const bearerAddress = normalizeSuiAddress(bearerSession.address);
    if (bearerAddress !== normalizedAddress) {
      return NextResponse.json({ error: "address_mismatch" }, { status: 409 });
    }
  } else if (process.env.NODE_ENV === "production") {
    const auth = await requireUserSignature(req, {
      intent: `mini:bind:${platform}:${openid}`,
      address: normalizedAddress,
      body: rawBody || undefined,
    });
    if (!auth.ok) return auth.response;
  }

  const account = await prisma.miniProgramAccount.upsert({
    where: { platform_openid: { platform, openid } },
    create: {
      id: `mp_${Date.now()}_${crypto.randomInt(1000, 9999)}`,
      platform,
      openid,
      unionid,
      sessionKey,
      userAddress: normalizedAddress,
      phone: payload.phone ?? null,
      createdAt: now,
      lastLoginAt: now,
    },
    update: {
      unionid,
      sessionKey,
      userAddress: normalizedAddress,
      phone: payload.phone ?? undefined,
      lastLoginAt: now,
      updatedAt: now,
    },
  });

  const { token, session } = await createUserSession({
    address: normalizedAddress,
    ip: getClientIp(req),
    userAgent: req.headers.get("user-agent") || undefined,
  });

  return NextResponse.json({
    ok: true,
    platform,
    openid: account.openid,
    unionid: account.unionid,
    address: account.userAddress,
    token,
    expiresAt: session.expiresAt,
    mock: true,
  });
}
