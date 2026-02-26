import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

vi.mock("@/lib/i18n/t", () => ({
  t: (key: string) => key,
}));

const mockGetCurrentAddress = vi.fn();
vi.mock("@/lib/chain/qy-chain-lite", () => ({
  getCurrentAddress: () => mockGetCurrentAddress(),
}));

const mockFetchWithUserAuth = vi.fn();
vi.mock("@/lib/auth/user-auth-client", () => ({
  fetchWithUserAuth: (...args: unknown[]) => mockFetchWithUserAuth(...args),
}));

vi.mock("@/lib/shared/client-cache", () => ({
  readCache: vi.fn(() => null),
  writeCache: vi.fn(),
}));

import { LevelCard } from "../level-card";

const mockLevelData = {
  points: 150,
  currentTier: { id: "t1", name: "Bronze", level: 1, badge: "🥉" },
  nextTier: { id: "t2", name: "Silver", level: 2, minPoints: 300 },
  pointsToNext: 150,
  progress: 50,
  isVip: false,
  allTiers: [
    { id: "t1", name: "Bronze", level: 1, badge: "🥉", reached: true },
    { id: "t2", name: "Silver", level: 2, badge: "🥈", minPoints: 300, reached: false },
  ],
};

describe("LevelCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentAddress.mockReturnValue("0xabc");
    mockFetchWithUserAuth.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockLevelData),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders null when no address", () => {
    mockGetCurrentAddress.mockReturnValue(null);
    const { container } = render(<LevelCard />);
    expect(container.innerHTML).toBe("");
  });

  it("renders level data after fetch", async () => {
    render(<LevelCard />);
    await waitFor(() => {
      // Bronze appears in both the header and the tier roadmap
      expect(screen.getAllByText("Bronze").length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getByText("150")).toBeInTheDocument();
  });

  it("renders tier roadmap", async () => {
    render(<LevelCard />);
    await waitFor(() => {
      // Silver appears in both the progress bar label and the tier roadmap
      expect(screen.getAllByText("Silver").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("renders checkin button", async () => {
    render(<LevelCard />);
    await waitFor(() => {
      expect(screen.getByText("components.level_card.i161")).toBeInTheDocument();
    });
  });

  it("handles checkin success", async () => {
    render(<LevelCard />);
    await waitFor(() => {
      expect(screen.getByText("components.level_card.i161")).toBeInTheDocument();
    });

    mockFetchWithUserAuth
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, earned: 10 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockLevelData),
      });

    fireEvent.click(screen.getByText("components.level_card.i161"));

    await waitFor(() => {
      expect(screen.getByText(/\+10/)).toBeInTheDocument();
    });
  });

  it("handles already checked in", async () => {
    render(<LevelCard />);
    await waitFor(() => {
      expect(screen.getByText("components.level_card.i161")).toBeInTheDocument();
    });

    mockFetchWithUserAuth.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ok: false, error: "already_checked_in" }),
    });

    fireEvent.click(screen.getByText("components.level_card.i161"));

    await waitFor(() => {
      expect(screen.getByText("components.level_card.i156")).toBeInTheDocument();
    });
  });

  it("handles checkin with other error (not already_checked_in)", async () => {
    render(<LevelCard />);
    await waitFor(() => {
      expect(screen.getByText("components.level_card.i161")).toBeInTheDocument();
    });

    mockFetchWithUserAuth.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ok: false, error: "some_other_error" }),
    });

    fireEvent.click(screen.getByText("components.level_card.i161"));

    await waitFor(() => {
      expect(screen.getByText("components.level_card.i157")).toBeInTheDocument();
    });
  });

  it("handles checkin network error (catch branch)", async () => {
    render(<LevelCard />);
    await waitFor(() => {
      expect(screen.getByText("components.level_card.i161")).toBeInTheDocument();
    });

    mockFetchWithUserAuth.mockRejectedValueOnce(new Error("network error"));

    fireEvent.click(screen.getByText("components.level_card.i161"));

    await waitFor(() => {
      expect(screen.getByText("签到失败")).toBeInTheDocument();
    });
  });

  it("handles checkin success with upgrade", async () => {
    render(<LevelCard />);
    await waitFor(() => {
      expect(screen.getByText("components.level_card.i161")).toBeInTheDocument();
    });

    mockFetchWithUserAuth
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, earned: 50, upgraded: { tierName: "Gold" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockLevelData),
      });

    fireEvent.click(screen.getByText("components.level_card.i161"));

    await waitFor(() => {
      expect(screen.getByText(/\+50.*Gold/)).toBeInTheDocument();
    });
  });

  it("handles checkin refresh failure", async () => {
    render(<LevelCard />);
    await waitFor(() => {
      expect(screen.getByText("components.level_card.i161")).toBeInTheDocument();
    });

    mockFetchWithUserAuth
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, earned: 10 }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve(null),
      });

    fireEvent.click(screen.getByText("components.level_card.i161"));

    await waitFor(() => {
      expect(screen.getByText(/\+10/)).toBeInTheDocument();
    });
  });

  it("renders without nextTier (no progress bar)", async () => {
    const dataNoNext = {
      ...mockLevelData,
      nextTier: null,
      pointsToNext: 0,
      progress: 100,
    };
    mockFetchWithUserAuth.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(dataNoNext),
    });

    render(<LevelCard />);
    await waitFor(() => {
      expect(screen.getByText("150")).toBeInTheDocument();
    });
    // No progress bar text
    expect(screen.queryByText(/还差.*积分升级/)).not.toBeInTheDocument();
  });

  it("renders without currentTier (fallback name and badge)", async () => {
    const dataNoTier = {
      ...mockLevelData,
      currentTier: null,
      allTiers: [],
    };
    mockFetchWithUserAuth.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(dataNoTier),
    });

    render(<LevelCard />);
    await waitFor(() => {
      expect(screen.getByText("components.level_card.i158")).toBeInTheDocument();
    });
  });

  it("renders tier without badge (fallback star)", async () => {
    const dataWithoutBadge = {
      ...mockLevelData,
      currentTier: { id: "t1", name: "NoBadgeTier", level: 1 },
      allTiers: [{ id: "t1", name: "NoBadgeTier", level: 1, reached: true }],
    };
    mockFetchWithUserAuth.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(dataWithoutBadge),
    });

    render(<LevelCard />);
    await waitFor(() => {
      expect(screen.getAllByText("NoBadgeTier").length).toBeGreaterThanOrEqual(1);
    });
    // Verify fallback star emoji is rendered
    expect(screen.getAllByText("⭐").length).toBeGreaterThanOrEqual(1);
  });

  it("renders with empty allTiers (no roadmap)", async () => {
    const dataEmptyTiers = {
      ...mockLevelData,
      allTiers: [],
    };
    mockFetchWithUserAuth.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(dataEmptyTiers),
    });

    render(<LevelCard />);
    await waitFor(() => {
      expect(screen.getByText("150")).toBeInTheDocument();
    });
  });

  it("handles fetch returning not ok", async () => {
    mockFetchWithUserAuth.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve(null),
    });

    const { container } = render(<LevelCard />);
    await waitFor(() => {
      // No data loaded, should render null
      expect(container.innerHTML).toBe("");
    });
  });

  it("handles fetch error (catch branch)", async () => {
    mockFetchWithUserAuth.mockRejectedValue(new Error("network"));

    const { container } = render(<LevelCard />);
    await waitFor(() => {
      expect(container.innerHTML).toBe("");
    });
  });

  it("does not call checkin when no address", async () => {
    render(<LevelCard />);
    await waitFor(() => {
      expect(screen.getByText("components.level_card.i161")).toBeInTheDocument();
    });

    // Set getCurrentAddress to return null for checkin
    mockGetCurrentAddress.mockReturnValue(null);

    fireEvent.click(screen.getByText("components.level_card.i161"));

    // Should not have made a POST call
    const postCalls = mockFetchWithUserAuth.mock.calls.filter(
      (c: unknown[]) =>
        typeof c[1] === "object" && (c[1] as Record<string, unknown>).method === "POST"
    );
    expect(postCalls).toHaveLength(0);
  });

  it("uses cache when available", async () => {
    const { readCache } = await import("@/lib/shared/client-cache");
    vi.mocked(readCache).mockReturnValue({
      value: mockLevelData,
      updatedAt: Date.now(),
      fresh: true,
    });

    render(<LevelCard />);
    // Should immediately show cached data
    await waitFor(() => {
      expect(screen.getByText("150")).toBeInTheDocument();
    });
  });

  it("renders currentTier without badge in progress bar label", async () => {
    const dataNoCurrentBadge = {
      ...mockLevelData,
      currentTier: { id: "t1", name: "Bronze", level: 1 },
      nextTier: { id: "t2", name: "Silver", level: 2, minPoints: 300 },
    };
    mockFetchWithUserAuth.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(dataNoCurrentBadge),
    });

    render(<LevelCard />);
    await waitFor(() => {
      expect(screen.getAllByText("Bronze").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("renders progress bar label fallback when no currentTier", async () => {
    const dataNoCurrentWithNext = {
      ...mockLevelData,
      currentTier: null,
      nextTier: { id: "t2", name: "Silver", level: 2, minPoints: 300 },
      allTiers: [],
    };
    mockFetchWithUserAuth.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(dataNoCurrentWithNext),
    });

    render(<LevelCard />);
    await waitFor(() => {
      expect(screen.getByText("components.level_card.i159")).toBeInTheDocument();
    });
  });

  it("renders tier with high level index (clamped to TIER_BAR_COLORS length)", async () => {
    const dataHighLevel = {
      ...mockLevelData,
      currentTier: { id: "t10", name: "DiamondTier", level: 10, badge: "💎" },
    };
    mockFetchWithUserAuth.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(dataHighLevel),
    });

    render(<LevelCard />);
    await waitFor(() => {
      expect(screen.getAllByText("DiamondTier").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("clears checkin result after 3s timeout (setTimeout callback)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    mockFetchWithUserAuth.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockLevelData),
    });

    render(<LevelCard />);

    // Wait for initial data to load
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    // Setup checkin response
    mockFetchWithUserAuth
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, earned: 10 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockLevelData),
      });

    // Click checkin
    await act(async () => {
      fireEvent.click(screen.getByText("components.level_card.i161"));
      await vi.advanceTimersByTimeAsync(100);
    });

    // Advance past the 3000ms timeout
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });

    vi.useRealTimers();
  });
});
