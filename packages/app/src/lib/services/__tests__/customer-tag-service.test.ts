import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindMany = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockGroupBy = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    customerTag: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      groupBy: (...args: unknown[]) => mockGroupBy(...args),
    },
  },
}));

import {
  getCustomerTags,
  getCustomerTagsBatch,
  addCustomerTag,
  removeCustomerTag,
  listTaggedCustomers,
  TAG_LABELS,
  TAG_LABELS_EN,
} from "@/lib/services/customer-tag-service";

beforeEach(() => {
  vi.clearAllMocks();
});

const sampleTag = {
  id: "tag-1",
  tag: "difficult",
  note: "多次投诉",
  severity: 3,
  reportedByRole: "companion",
  createdAt: new Date(),
};

describe("TAG_LABELS", () => {
  it("has labels for all tag types", () => {
    expect(TAG_LABELS.difficult).toBe("事多/难伺候");
    expect(TAG_LABELS.vip_treat).toBe("VIP 优待");
    expect(Object.keys(TAG_LABELS)).toHaveLength(7);
  });

  it("has English labels for all tag types", () => {
    expect(TAG_LABELS_EN.difficult).toBe("Difficult customer");
    expect(Object.keys(TAG_LABELS_EN)).toHaveLength(7);
  });
});

describe("getCustomerTags", () => {
  it("returns tags with computed maxSeverity", async () => {
    mockFindMany.mockResolvedValue([sampleTag, { ...sampleTag, id: "tag-2", severity: 5 }]);

    const result = await getCustomerTags("0xabc");

    expect(result.userAddress).toBe("0xabc");
    expect(result.tagCount).toBe(2);
    expect(result.maxSeverity).toBe(5);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userAddress: "0xabc", active: true },
      })
    );
  });

  it("returns maxSeverity 0 when no tags", async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await getCustomerTags("0xabc");

    expect(result.tagCount).toBe(0);
    expect(result.maxSeverity).toBe(0);
  });
});

describe("getCustomerTagsBatch", () => {
  it("returns empty map for empty input", async () => {
    const result = await getCustomerTagsBatch([]);
    expect(result.size).toBe(0);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("groups tags by userAddress", async () => {
    mockFindMany.mockResolvedValue([
      { ...sampleTag, userAddress: "0xabc" },
      { ...sampleTag, id: "tag-2", userAddress: "0xdef", severity: 1 },
    ]);

    const result = await getCustomerTagsBatch(["0xabc", "0xdef"]);

    expect(result.size).toBe(2);
    expect(result.get("0xabc")!.tagCount).toBe(1);
    expect(result.get("0xdef")!.tagCount).toBe(1);
  });

  it("returns zero tags for addresses with no matches", async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await getCustomerTagsBatch(["0xabc"]);

    expect(result.get("0xabc")!.tagCount).toBe(0);
    expect(result.get("0xabc")!.maxSeverity).toBe(0);
  });
});

describe("addCustomerTag", () => {
  it("creates a tag with provided params", async () => {
    mockCreate.mockResolvedValue({ id: "tag-new", tag: "rude" });

    await addCustomerTag({
      userAddress: "0xabc",
      tag: "rude",
      note: "骂人",
      severity: 2,
      reportedBy: "0xadmin",
      reportedByRole: "admin",
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userAddress: "0xabc",
          tag: "rude",
          note: "骂人",
          severity: 2,
          reportedByRole: "admin",
        }),
      })
    );
  });

  it("uses default severity 1 and role companion when not provided", async () => {
    mockCreate.mockResolvedValue({ id: "tag-new" });

    await addCustomerTag({
      userAddress: "0xabc",
      tag: "slow_pay",
      reportedBy: "0xcomp",
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          severity: 1,
          reportedByRole: "companion",
          note: null,
        }),
      })
    );
  });
});

describe("removeCustomerTag", () => {
  it("deactivates a tag by id", async () => {
    mockUpdate.mockResolvedValue({ id: "tag-1", active: false });

    await removeCustomerTag("tag-1");

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "tag-1" },
        data: { active: false },
      })
    );
  });
});

describe("listTaggedCustomers", () => {
  it("returns grouped customers with defaults", async () => {
    mockGroupBy.mockResolvedValue([
      { userAddress: "0xabc", _count: { id: 3 }, _max: { severity: 5 } },
    ]);

    const result = await listTaggedCustomers();

    expect(result).toHaveLength(1);
    expect(result[0].userAddress).toBe("0xabc");
    expect(result[0].tagCount).toBe(3);
    expect(result[0].maxSeverity).toBe(5);
  });

  it("passes limit and offset to groupBy", async () => {
    mockGroupBy.mockResolvedValue([]);

    await listTaggedCustomers({ limit: 10, offset: 20 });

    expect(mockGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 10,
        skip: 20,
      })
    );
  });
});
