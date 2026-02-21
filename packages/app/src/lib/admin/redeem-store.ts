import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type {
  AdminRedeemBatch,
  AdminRedeemCode,
  AdminRedeemRecord,
  RedeemCodeStatus,
  RedeemRecordStatus,
  RedeemRewardType,
} from "./admin-types";

function mapRedeemBatch(row: {
  id: string;
  title: string;
  description: string | null;
  rewardType: string;
  rewardPayload: Prisma.JsonValue | null;
  status: string;
  maxRedeem: number | null;
  maxRedeemPerUser: number | null;
  totalCodes: number | null;
  usedCount: number;
  startsAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date | null;
}): AdminRedeemBatch {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    rewardType: row.rewardType as RedeemRewardType,
    rewardPayload: (row.rewardPayload as Record<string, unknown> | null) ?? undefined,
    status: row.status as RedeemCodeStatus,
    maxRedeem: row.maxRedeem ?? null,
    maxRedeemPerUser: row.maxRedeemPerUser ?? null,
    totalCodes: row.totalCodes ?? null,
    usedCount: row.usedCount,
    startsAt: row.startsAt ? row.startsAt.getTime() : null,
    expiresAt: row.expiresAt ? row.expiresAt.getTime() : null,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt ? row.updatedAt.getTime() : undefined,
  };
}

function mapRedeemCode(row: {
  id: string;
  batchId: string | null;
  code: string;
  status: string;
  maxRedeem: number;
  maxRedeemPerUser: number;
  usedCount: number;
  rewardType: string | null;
  rewardPayload: Prisma.JsonValue | null;
  startsAt: Date | null;
  expiresAt: Date | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date | null;
  lastRedeemedAt: Date | null;
}): AdminRedeemCode {
  return {
    id: row.id,
    batchId: row.batchId ?? undefined,
    code: row.code,
    status: row.status as RedeemCodeStatus,
    maxRedeem: row.maxRedeem,
    maxRedeemPerUser: row.maxRedeemPerUser,
    usedCount: row.usedCount,
    rewardType: row.rewardType ? (row.rewardType as RedeemRewardType) : undefined,
    rewardPayload: (row.rewardPayload as Record<string, unknown> | null) ?? undefined,
    startsAt: row.startsAt ? row.startsAt.getTime() : null,
    expiresAt: row.expiresAt ? row.expiresAt.getTime() : null,
    note: row.note ?? undefined,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt ? row.updatedAt.getTime() : undefined,
    lastRedeemedAt: row.lastRedeemedAt ? row.lastRedeemedAt.getTime() : undefined,
  };
}

function mapRedeemRecord(row: {
  id: string;
  codeId: string;
  batchId: string | null;
  userAddress: string;
  rewardType: string;
  rewardPayload: Prisma.JsonValue | null;
  status: string;
  createdAt: Date;
  ip: string | null;
  userAgent: string | null;
  meta: Prisma.JsonValue | null;
}): AdminRedeemRecord {
  return {
    id: row.id,
    codeId: row.codeId,
    batchId: row.batchId ?? undefined,
    userAddress: row.userAddress,
    rewardType: row.rewardType as RedeemRewardType,
    rewardPayload: (row.rewardPayload as Record<string, unknown> | null) ?? undefined,
    status: row.status as RedeemRecordStatus,
    createdAt: row.createdAt.getTime(),
    ip: row.ip ?? undefined,
    userAgent: row.userAgent ?? undefined,
    meta: (row.meta as Record<string, unknown> | null) ?? undefined,
  };
}

export function normalizeRedeemCode(raw: string): string {
  return raw
    .replace(/[\s-]+/g, "")
    .trim()
    .toUpperCase();
}

export async function createRedeemBatch(params: {
  id: string;
  title: string;
  description?: string;
  rewardType: RedeemRewardType;
  rewardPayload?: Record<string, unknown>;
  status: RedeemCodeStatus;
  maxRedeem?: number | null;
  maxRedeemPerUser?: number | null;
  startsAt?: Date | null;
  expiresAt?: Date | null;
  totalCodes?: number | null;
}) {
  const row = await prisma.redeemBatch.create({
    data: {
      id: params.id,
      title: params.title,
      description: params.description ?? null,
      rewardType: params.rewardType,
      rewardPayload: params.rewardPayload
        ? (params.rewardPayload as Prisma.InputJsonValue)
        : Prisma.DbNull,
      status: params.status,
      maxRedeem: params.maxRedeem ?? null,
      maxRedeemPerUser: params.maxRedeemPerUser ?? null,
      totalCodes: params.totalCodes ?? null,
      startsAt: params.startsAt ?? null,
      expiresAt: params.expiresAt ?? null,
      createdAt: new Date(),
    },
  });
  return mapRedeemBatch(row);
}

export async function createRedeemCodes(params: {
  batchId?: string | null;
  codes: string[];
  status: RedeemCodeStatus;
  maxRedeem: number;
  maxRedeemPerUser: number;
  rewardType?: RedeemRewardType;
  rewardPayload?: Record<string, unknown>;
  startsAt?: Date | null;
  expiresAt?: Date | null;
  note?: string;
}) {
  if (!params.codes.length) return [];
  const now = new Date();
  await prisma.redeemCode.createMany({
    data: params.codes.map((code) => ({
      id: `RCD-${now.getTime()}-${Math.floor(Math.random() * 10_000)}-${code.slice(-4)}`,
      batchId: params.batchId ?? null,
      code,
      status: params.status,
      maxRedeem: params.maxRedeem,
      maxRedeemPerUser: params.maxRedeemPerUser,
      usedCount: 0,
      rewardType: params.rewardType ?? null,
      rewardPayload: params.rewardPayload
        ? (params.rewardPayload as Prisma.InputJsonValue)
        : Prisma.DbNull,
      startsAt: params.startsAt ?? null,
      expiresAt: params.expiresAt ?? null,
      note: params.note ?? null,
      createdAt: now,
    })),
  });

  const rows = await prisma.redeemCode.findMany({
    where: { code: { in: params.codes } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(mapRedeemCode);
}

export async function queryRedeemCodes(params: {
  page: number;
  pageSize: number;
  status?: string;
  q?: string;
  batchId?: string;
}) {
  const { page, pageSize, status, q, batchId } = params;
  const keyword = (q || "").trim();
  const where: Prisma.RedeemCodeWhereInput = {};
  if (status) where.status = status;
  if (batchId) where.batchId = batchId;
  if (keyword) {
    where.OR = [
      { code: { contains: keyword, mode: "insensitive" } },
      { batch: { title: { contains: keyword, mode: "insensitive" } } },
      { batch: { id: { contains: keyword, mode: "insensitive" } } },
    ];
  }

  const total = await prisma.redeemCode.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(Math.max(page, 1), totalPages);
  const rows = await prisma.redeemCode.findMany({
    where,
    include: { batch: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (clampedPage - 1) * pageSize,
    take: pageSize,
  });
  return {
    items: rows.map((row) => ({
      ...mapRedeemCode(row),
      batch: row.batch ? mapRedeemBatch(row.batch) : undefined,
    })),
    total,
    page: clampedPage,
    pageSize,
    totalPages,
  };
}

export async function queryRedeemRecords(params: {
  page: number;
  pageSize: number;
  status?: string;
  q?: string;
  codeId?: string;
  batchId?: string;
  address?: string;
}) {
  const { page, pageSize, status, q, codeId, batchId, address } = params;
  const keyword = (q || "").trim();
  const where: Prisma.RedeemRecordWhereInput = {};
  if (status) where.status = status;
  if (codeId) where.codeId = codeId;
  if (batchId) where.batchId = batchId;
  if (address) where.userAddress = address;
  if (keyword) {
    where.OR = [
      { userAddress: { contains: keyword, mode: "insensitive" } },
      { code: { code: { contains: keyword, mode: "insensitive" } } },
      { batch: { title: { contains: keyword, mode: "insensitive" } } },
    ];
  }

  const total = await prisma.redeemRecord.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(Math.max(page, 1), totalPages);
  const rows = await prisma.redeemRecord.findMany({
    where,
    include: { code: true, batch: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (clampedPage - 1) * pageSize,
    take: pageSize,
  });

  return {
    items: rows.map((row) => ({
      ...mapRedeemRecord(row),
      code: row.code?.code,
      batchTitle: row.batch?.title,
    })),
    total,
    page: clampedPage,
    pageSize,
    totalPages,
  };
}

export async function updateRedeemCodeStatus(codeId: string, status: RedeemCodeStatus) {
  try {
    const row = await prisma.redeemCode.update({
      where: { id: codeId },
      data: { status, updatedAt: new Date() },
    });
    return mapRedeemCode(row);
  } catch {
    return null;
  }
}

export async function getRedeemCodeByCode(code: string) {
  const row = await prisma.redeemCode.findUnique({
    where: { code },
    include: { batch: true },
  });
  if (!row) return null;
  return {
    code: mapRedeemCode(row),
    batch: row.batch ? mapRedeemBatch(row.batch) : null,
  };
}
