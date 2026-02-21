import type { MantouWallet, MantouTransaction, MantouWithdrawRequest } from "./admin-types";
import {
  prisma,
  Prisma,
  type CursorPayload,
  appendCursorWhere,
  buildCursorPayload,
} from "./admin-store-utils";

function mapMantouWallet(row: {
  address: string;
  balance: number;
  frozen: number;
  createdAt: Date;
  updatedAt: Date | null;
}): MantouWallet {
  return {
    address: row.address,
    balance: row.balance,
    frozen: row.frozen,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt ? row.updatedAt.getTime() : undefined,
  };
}

function mapMantouTransaction(row: {
  id: string;
  address: string;
  type: string;
  amount: number;
  orderId: string | null;
  note: string | null;
  createdAt: Date;
}): MantouTransaction {
  return {
    id: row.id,
    address: row.address,
    type: row.type,
    amount: row.amount,
    orderId: row.orderId || undefined,
    note: row.note || undefined,
    createdAt: row.createdAt.getTime(),
  };
}

function mapMantouWithdraw(row: {
  id: string;
  address: string;
  amount: number;
  status: string;
  note: string | null;
  account: string | null;
  createdAt: Date;
  updatedAt: Date | null;
}): MantouWithdrawRequest {
  return {
    id: row.id,
    address: row.address,
    amount: row.amount,
    status: row.status as MantouWithdrawRequest["status"],
    note: row.note || undefined,
    account: row.account || undefined,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt ? row.updatedAt.getTime() : undefined,
  };
}

export { mapMantouWallet, mapMantouTransaction };

export async function getMantouWallet(address: string) {
  const row = await prisma.mantouWallet.findUnique({ where: { address } });
  if (!row) {
    return {
      address,
      balance: 0,
      frozen: 0,
      createdAt: Date.now(),
    } satisfies MantouWallet;
  }
  return mapMantouWallet(row);
}

export async function creditMantou(params: {
  address: string;
  amount: number;
  orderId?: string;
  note?: string;
}) {
  const amount = Math.floor(params.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("amount must be positive integer");
  }
  return prisma.$transaction(async (tx) => {
    if (params.orderId) {
      const existing = await tx.mantouTransaction.findFirst({
        where: { orderId: params.orderId, type: "credit" },
      });
      if (existing) {
        const wallet = await tx.mantouWallet.findUnique({ where: { address: params.address } });
        return {
          wallet: wallet ? mapMantouWallet(wallet) : undefined,
          transaction: mapMantouTransaction(existing),
          duplicated: true,
        };
      }
    }
    const now = new Date();
    const wallet = await tx.mantouWallet.upsert({
      where: { address: params.address },
      create: { address: params.address, balance: amount, frozen: 0, createdAt: now },
      update: { balance: { increment: amount }, updatedAt: now },
    });
    const transaction = await tx.mantouTransaction.create({
      data: {
        id: `MT-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        address: params.address,
        type: "credit",
        amount,
        orderId: params.orderId ?? null,
        note: params.note ?? null,
        createdAt: now,
      },
    });
    return {
      wallet: mapMantouWallet(wallet),
      transaction: mapMantouTransaction(transaction),
      duplicated: false,
    };
  });
}

export async function requestMantouWithdraw(params: {
  address: string;
  amount: number;
  account?: string;
  note?: string;
}) {
  const amount = Math.floor(params.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("amount must be positive integer");
  }
  return prisma.$transaction(async (tx) => {
    const wallet = await tx.mantouWallet.findUnique({ where: { address: params.address } });
    const balance = wallet?.balance ?? 0;
    const frozen = wallet?.frozen ?? 0;
    if (balance < amount) {
      throw new Error("余额不足");
    }
    const now = new Date();
    const nextWallet = await tx.mantouWallet.upsert({
      where: { address: params.address },
      create: {
        address: params.address,
        balance: balance - amount,
        frozen: frozen + amount,
        createdAt: now,
      },
      update: {
        balance: { decrement: amount },
        frozen: { increment: amount },
        updatedAt: now,
      },
    });
    const request = await tx.mantouWithdrawRequest.create({
      data: {
        id: `MW-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        address: params.address,
        amount,
        status: "待审核",
        note: params.note ?? null,
        account: params.account ?? null,
        createdAt: now,
      },
    });
    await tx.mantouTransaction.create({
      data: {
        id: `MT-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        address: params.address,
        type: "withdraw_request",
        amount,
        orderId: null,
        note: params.note ?? null,
        createdAt: now,
      },
    });
    return { wallet: mapMantouWallet(nextWallet), request: mapMantouWithdraw(request) };
  });
}

export async function queryMantouWithdraws(params: {
  page: number;
  pageSize: number;
  status?: string;
  address?: string;
}) {
  const { page, pageSize, status, address } = params;
  const where: Prisma.MantouWithdrawRequestWhereInput = {};
  if (status) where.status = status;
  if (address) where.address = address;
  const total = await prisma.mantouWithdrawRequest.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(Math.max(page, 1), totalPages);
  const rows = await prisma.mantouWithdrawRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (clampedPage - 1) * pageSize,
    take: pageSize,
  });
  return {
    items: rows.map(mapMantouWithdraw),
    total,
    page: clampedPage,
    pageSize,
    totalPages,
  };
}

export async function queryMantouWithdrawsCursor(params: {
  pageSize: number;
  status?: string;
  address?: string;
  cursor?: CursorPayload;
}) {
  const { pageSize, status, address, cursor } = params;
  const where: Prisma.MantouWithdrawRequestWhereInput = {};
  if (status && status !== "全部") where.status = status;
  if (address) where.address = address;
  appendCursorWhere(where, cursor);
  const rows = await prisma.mantouWithdrawRequest.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
  });
  const hasMore = rows.length > pageSize;
  const sliced = hasMore ? rows.slice(0, pageSize) : rows;
  return {
    items: sliced.map(mapMantouWithdraw),
    nextCursor: hasMore ? buildCursorPayload(sliced[sliced.length - 1]) : null,
  };
}

export async function updateMantouWithdrawStatus(params: {
  id: string;
  status: "已通过" | "已打款" | "已拒绝" | "已退回";
  note?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.mantouWithdrawRequest.findUnique({ where: { id: params.id } });
    if (!request) return null;
    if (request.status === params.status) {
      return mapMantouWithdraw(request);
    }
    const now = new Date();
    const wallet = await tx.mantouWallet.findUnique({ where: { address: request.address } });
    const frozen = wallet?.frozen ?? 0;
    if (frozen < request.amount) {
      throw new Error("冻结余额不足");
    }
    if (params.status === "已通过") {
      await tx.mantouTransaction.create({
        data: {
          id: `MT-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          address: request.address,
          type: "withdraw_approved",
          amount: request.amount,
          orderId: null,
          note: params.note ?? null,
          createdAt: now,
        },
      });
    }
    if (params.status === "已打款") {
      await tx.mantouWallet.upsert({
        where: { address: request.address },
        create: {
          address: request.address,
          balance: 0,
          frozen: frozen - request.amount,
          createdAt: now,
        },
        update: { frozen: { decrement: request.amount }, updatedAt: now },
      });
      await tx.mantouTransaction.create({
        data: {
          id: `MT-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          address: request.address,
          type: "withdraw_paid",
          amount: request.amount,
          orderId: null,
          note: params.note ?? null,
          createdAt: now,
        },
      });
    }
    if (params.status === "已拒绝" || params.status === "已退回") {
      await tx.mantouWallet.upsert({
        where: { address: request.address },
        create: {
          address: request.address,
          balance: request.amount,
          frozen: frozen - request.amount,
          createdAt: now,
        },
        update: {
          balance: { increment: request.amount },
          frozen: { decrement: request.amount },
          updatedAt: now,
        },
      });
      await tx.mantouTransaction.create({
        data: {
          id: `MT-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          address: request.address,
          type: params.status === "已拒绝" ? "withdraw_rejected" : "withdraw_returned",
          amount: request.amount,
          orderId: null,
          note: params.note ?? null,
          createdAt: now,
        },
      });
    }
    const updated = await tx.mantouWithdrawRequest.update({
      where: { id: params.id },
      data: { status: params.status, note: params.note ?? request.note, updatedAt: now },
    });
    return mapMantouWithdraw(updated);
  });
}

export async function queryMantouTransactions(params: {
  page: number;
  pageSize: number;
  address: string;
}) {
  const { page, pageSize, address } = params;
  const total = await prisma.mantouTransaction.count({ where: { address } });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(Math.max(page, 1), totalPages);
  const rows = await prisma.mantouTransaction.findMany({
    where: { address },
    orderBy: { createdAt: "desc" },
    skip: (clampedPage - 1) * pageSize,
    take: pageSize,
  });
  return {
    items: rows.map(mapMantouTransaction),
    total,
    page: clampedPage,
    pageSize,
    totalPages,
  };
}
