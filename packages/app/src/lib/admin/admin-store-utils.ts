import "server-only";
/* eslint-disable @typescript-eslint/no-namespace */

type LegacyDbModule = {
  prisma: Record<string | symbol, unknown>;
};

let legacyDbPromise: Promise<LegacyDbModule> | null = null;

async function getLegacyDbModule() {
  const modulePath = "../db";
  legacyDbPromise ??= import(modulePath).then((mod) => mod as unknown as LegacyDbModule);
  return legacyDbPromise;
}

async function invokePrismaPath(path: Array<string | symbol>, args: unknown[]) {
  const { prisma: legacyPrisma } = await getLegacyDbModule();
  if (path.length === 0) return legacyPrisma;

  let parent: Record<string | symbol, unknown> | undefined = legacyPrisma;
  for (let i = 0; i < path.length - 1; i += 1) {
    parent = parent?.[path[i]] as Record<string | symbol, unknown> | undefined;
  }

  const leafKey = path[path.length - 1];
  const leaf = parent?.[leafKey];
  if (typeof leaf === "function") {
    return (leaf as (...fnArgs: unknown[]) => unknown).apply(parent, args);
  }
  return leaf;
}

function createPrismaProxy(path: Array<string | symbol> = []): unknown {
  return new Proxy(() => undefined, {
    get(_target, prop) {
      if (prop === "then" && path.length === 0) return undefined;
      return createPrismaProxy([...path, prop]);
    },
    apply(_target, _thisArg, args) {
      return invokePrismaPath(path, args);
    },
  });
}

export type TransactionClient = Record<string, unknown>;
export const prisma = createPrismaProxy() as TransactionClient;

export namespace Prisma {
  export type JsonValue = unknown;
  export type InputJsonValue = unknown;
  export type Decimal = number;
  export type DateTimeFilter = Record<string, unknown>;

  export type AdminOrderWhereInput = Record<string, unknown>;
  export type AdminOrderUpdateInput = Record<string, unknown>;
  export type AdminOrderUpdateManyMutationInput = Record<string, unknown>;
  export type AdminCouponWhereInput = Record<string, unknown>;
  export type AdminInvoiceRequestWhereInput = Record<string, unknown>;
  export type AdminGuardianApplicationWhereInput = Record<string, unknown>;
  export type AdminExaminerApplicationWhereInput = Record<string, unknown>;
  export type AdminLiveApplicationWhereInput = Record<string, unknown>;
  export type AdminSupportTicketWhereInput = Record<string, unknown>;
  export type AdminMembershipTierWhereInput = Record<string, unknown>;
  export type AdminMemberWhereInput = Record<string, unknown>;
  export type AdminMembershipRequestWhereInput = Record<string, unknown>;
  export type AdminAuditLogWhereInput = Record<string, unknown>;
  export type AdminPaymentEventWhereInput = Record<string, unknown>;
  export type MantouWithdrawRequestWhereInput = Record<string, unknown>;
  export type ReferralWhereInput = Record<string, unknown>;
  export type RedeemCodeWhereInput = Record<string, unknown>;
  export type RedeemRecordWhereInput = Record<string, unknown>;
  export type DuoOrderWhereInput = Record<string, unknown>;
  export type DuoOrderUpdateInput = Record<string, unknown>;
  export type LedgerRecordUpdateInput = Record<string, unknown>;

  export const DbNull = null;
}

export type CursorPayload = { createdAt: number; id: string };

export function buildCursorPayload(row: { id: string; createdAt: Date }): CursorPayload {
  return { id: row.id, createdAt: row.createdAt.getTime() };
}

export function appendCursorWhere(where: { AND?: unknown }, cursor?: CursorPayload) {
  if (!cursor) return;
  const cursorDate = new Date(cursor.createdAt);
  const condition = {
    OR: [{ createdAt: { lt: cursorDate } }, { createdAt: cursorDate, id: { lt: cursor.id } }],
  };
  if (where.AND) {
    const existing = Array.isArray(where.AND) ? where.AND : [where.AND];
    where.AND = [...existing, condition];
  } else {
    where.AND = [condition];
  }
}
