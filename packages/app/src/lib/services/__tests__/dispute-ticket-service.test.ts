import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindFirst = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@/lib/admin/admin-store-utils", () => ({
  prisma: {
    adminSupportTicket: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
  Prisma: { InputJsonValue: {}, DbNull: "DbNull" },
}));

vi.mock("@/lib/shared/soft-delete", () => ({
  notDeleted: { deletedAt: null },
}));

import { findDisputeTicketByOrderId, closeDisputeTicket } from "../dispute-ticket-service";

const fakeTicket = {
  id: "SUP-123",
  topic: "链上争议",
  status: "待处理",
  meta: { type: "chain_dispute", orderId: "ORD-1" },
  createdAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("findDisputeTicketByOrderId", () => {
  it("queries by topic and meta.orderId", async () => {
    mockFindFirst.mockResolvedValue(fakeTicket);
    const result = await findDisputeTicketByOrderId("ORD-1");
    expect(result).toBe(fakeTicket);
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        topic: "链上争议",
        meta: { path: ["orderId"], equals: "ORD-1" },
      }),
      orderBy: { createdAt: "desc" },
    });
  });

  it("returns null when no ticket found", async () => {
    mockFindFirst.mockResolvedValue(null);
    const result = await findDisputeTicketByOrderId("ORD-999");
    expect(result).toBeNull();
  });
});

describe("closeDisputeTicket", () => {
  it("updates ticket status to 已完成 with resolution", async () => {
    mockFindFirst.mockResolvedValue(fakeTicket);
    mockUpdate.mockResolvedValue({ ...fakeTicket, status: "已完成" });

    const result = await closeDisputeTicket("ORD-1", {
      resolution: "refund",
      digest: "0xdigest",
    });

    expect(result).toBeTruthy();
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "SUP-123" },
      data: expect.objectContaining({
        status: "已完成",
        reply: "争议已解决：refund",
        meta: expect.objectContaining({
          type: "chain_dispute",
          orderId: "ORD-1",
          resolution: "refund",
          digest: "0xdigest",
          resolvedAt: expect.any(Number),
        }),
      }),
    });
  });

  it("returns null when no ticket exists for orderId", async () => {
    mockFindFirst.mockResolvedValue(null);
    const result = await closeDisputeTicket("ORD-999", { resolution: "reject" });
    expect(result).toBeNull();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("uses default reply when no resolution provided", async () => {
    mockFindFirst.mockResolvedValue(fakeTicket);
    mockUpdate.mockResolvedValue({ ...fakeTicket, status: "已完成" });

    await closeDisputeTicket("ORD-1", {});

    const updateCall = mockUpdate.mock.calls[0][0];
    expect(updateCall.data.reply).toBe("争议已由管理员解决");
  });
});
