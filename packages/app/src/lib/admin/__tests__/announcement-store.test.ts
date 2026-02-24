import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindMany = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockDeleteMany = vi.fn();

vi.mock("../admin-store-utils", () => ({
  prisma: {
    adminAnnouncement: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
    },
  },
}));

vi.mock("../../server-cache", () => ({
  getCache: vi.fn().mockReturnValue(null),
  setCache: vi.fn(),
}));

import {
  listAnnouncements,
  addAnnouncement,
  updateAnnouncement,
  removeAnnouncement,
  removeAnnouncements,
  listPublicAnnouncements,
} from "../announcement-store";

beforeEach(() => {
  vi.clearAllMocks();
  delete (process.env as Record<string, unknown>).NEXT_PUBLIC_VISUAL_TEST;
  delete (process.env as Record<string, unknown>).VISUAL_TEST;
});

const now = new Date("2026-01-15T10:00:00Z");

const baseAnnouncementRow = {
  id: "ANN-1",
  title: "系统维护通知",
  tag: "系统",
  content: "系统将于今晚维护",
  status: "published",
  createdAt: now,
  updatedAt: null,
};

describe("listAnnouncements", () => {
  it("returns all announcements", async () => {
    mockFindMany.mockResolvedValue([baseAnnouncementRow]);

    const result = await listAnnouncements();
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("系统维护通知");
    expect(result[0].createdAt).toBe(now.getTime());
  });
});

describe("addAnnouncement", () => {
  it("creates a new announcement", async () => {
    mockCreate.mockResolvedValue(baseAnnouncementRow);

    const result = await addAnnouncement({
      id: "ANN-1",
      title: "系统维护通知",
      tag: "系统",
      content: "系统将于今晚维护",
      status: "published",
      createdAt: now.getTime(),
    });

    expect(result.id).toBe("ANN-1");
    expect(result.status).toBe("published");
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("creates announcement with updatedAt", async () => {
    const updatedRow = { ...baseAnnouncementRow, updatedAt: now };
    mockCreate.mockResolvedValue(updatedRow);

    const result = await addAnnouncement({
      id: "ANN-2",
      title: "更新通知",
      tag: "系统",
      content: "内容",
      status: "draft",
      createdAt: now.getTime(),
      updatedAt: now.getTime(),
    });

    expect(result.updatedAt).toBe(now.getTime());
  });
});

describe("updateAnnouncement", () => {
  it("updates announcement and returns result", async () => {
    mockUpdate.mockResolvedValue({ ...baseAnnouncementRow, title: "更新通知" });

    const result = await updateAnnouncement("ANN-1", { title: "更新通知" });
    expect(result).not.toBeNull();
    expect(result!.title).toBe("更新通知");
  });

  it("returns null on error", async () => {
    mockUpdate.mockRejectedValue(new Error("not found"));

    const result = await updateAnnouncement("ANN-999", { title: "x" });
    expect(result).toBeNull();
  });
});

describe("removeAnnouncement", () => {
  it("returns true on success", async () => {
    mockDelete.mockResolvedValue(baseAnnouncementRow);
    expect(await removeAnnouncement("ANN-1")).toBe(true);
  });

  it("returns false on error", async () => {
    mockDelete.mockRejectedValue(new Error("not found"));
    expect(await removeAnnouncement("ANN-999")).toBe(false);
  });
});

describe("removeAnnouncements", () => {
  it("deletes multiple announcements", async () => {
    mockDeleteMany.mockResolvedValue({ count: 3 });

    const result = await removeAnnouncements(["ANN-1", "ANN-2", "ANN-3"]);
    expect(result).toBe(3);
  });

  it("returns 0 for empty array", async () => {
    const result = await removeAnnouncements([]);
    expect(result).toBe(0);
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });

  it("filters out empty strings", async () => {
    const result = await removeAnnouncements(["", ""]);
    expect(result).toBe(0);
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });
});

describe("listPublicAnnouncements", () => {
  it("returns published announcements", async () => {
    mockFindMany.mockResolvedValue([baseAnnouncementRow]);

    const result = await listPublicAnnouncements();
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("published");
  });

  it("returns empty array in visual test mode", async () => {
    process.env.NEXT_PUBLIC_VISUAL_TEST = "1";

    const result = await listPublicAnnouncements();
    expect(result).toEqual([]);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("returns empty array when VISUAL_TEST=1", async () => {
    process.env.VISUAL_TEST = "1";

    const result = await listPublicAnnouncements();
    expect(result).toEqual([]);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("returns cached data when available", async () => {
    const { getCache } = await import("../../server-cache");
    vi.mocked(getCache).mockReturnValueOnce({
      value: [
        {
          id: "ANN-CACHED",
          title: "Cached",
          tag: "系统",
          content: "cached",
          status: "published",
          createdAt: now.getTime(),
        },
      ],
      updatedAt: Date.now(),
    });

    const result = await listPublicAnnouncements();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("ANN-CACHED");
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("maps updatedAt when present", async () => {
    const updatedRow = { ...baseAnnouncementRow, updatedAt: now };
    mockFindMany.mockResolvedValue([updatedRow]);

    const result = await listPublicAnnouncements();
    expect(result[0].updatedAt).toBe(now.getTime());
  });
});
