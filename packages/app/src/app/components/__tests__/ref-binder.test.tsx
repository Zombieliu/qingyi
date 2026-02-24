import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

const mockGetCurrentAddress = vi.fn();
const mockFetchWithUserAuth = vi.fn();

vi.mock("@/lib/chain/qy-chain-lite", () => ({
  getCurrentAddress: () => mockGetCurrentAddress(),
}));

vi.mock("@/lib/auth/user-auth-client", () => ({
  fetchWithUserAuth: (...args: unknown[]) => mockFetchWithUserAuth(...args),
}));

import { RefBinder, captureRefCode } from "../ref-binder";

describe("captureRefCode", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("stores ref code from URL search params", () => {
    Object.defineProperty(window, "location", {
      value: { search: "?ref=ABC123" },
      writable: true,
    });
    captureRefCode();
    expect(localStorage.getItem("qy_ref_code")).toBe("ABC123");
  });

  it("trims whitespace from ref code", () => {
    Object.defineProperty(window, "location", {
      value: { search: "?ref=%20XYZ%20" },
      writable: true,
    });
    captureRefCode();
    expect(localStorage.getItem("qy_ref_code")).toBe("XYZ");
  });

  it("does not store empty ref code", () => {
    Object.defineProperty(window, "location", {
      value: { search: "?ref=" },
      writable: true,
    });
    captureRefCode();
    expect(localStorage.getItem("qy_ref_code")).toBeNull();
  });

  it("does nothing when no ref param", () => {
    Object.defineProperty(window, "location", {
      value: { search: "" },
      writable: true,
    });
    captureRefCode();
    expect(localStorage.getItem("qy_ref_code")).toBeNull();
  });
});

describe("RefBinder", () => {
  beforeEach(() => {
    localStorage.clear();
    mockGetCurrentAddress.mockReset();
    mockFetchWithUserAuth.mockReset();
    Object.defineProperty(window, "location", {
      value: { search: "" },
      writable: true,
    });
  });

  it("renders nothing", () => {
    const { container } = render(<RefBinder />);
    expect(container.innerHTML).toBe("");
  });

  it("calls bind API when ref code and address exist", async () => {
    localStorage.setItem("qy_ref_code", "REF001");
    mockGetCurrentAddress.mockReturnValue("0xabc");
    mockFetchWithUserAuth.mockResolvedValue({ ok: true, status: 200 });

    render(<RefBinder />);
    await new Promise((r) => setTimeout(r, 10));

    expect(mockFetchWithUserAuth).toHaveBeenCalledWith(
      "/api/referral/bind",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ address: "0xabc", refCode: "REF001" }),
      }),
      "0xabc"
    );
  });

  it("removes ref code from storage on success", async () => {
    localStorage.setItem("qy_ref_code", "REF002");
    mockGetCurrentAddress.mockReturnValue("0xdef");
    mockFetchWithUserAuth.mockResolvedValue({ ok: true, status: 200 });

    render(<RefBinder />);
    await new Promise((r) => setTimeout(r, 10));

    expect(localStorage.getItem("qy_ref_code")).toBeNull();
  });

  it("removes ref code on 409 conflict", async () => {
    localStorage.setItem("qy_ref_code", "REF003");
    mockGetCurrentAddress.mockReturnValue("0xghi");
    mockFetchWithUserAuth.mockResolvedValue({ ok: false, status: 409 });

    render(<RefBinder />);
    await new Promise((r) => setTimeout(r, 10));

    expect(localStorage.getItem("qy_ref_code")).toBeNull();
  });

  it("does not call API when no ref code", async () => {
    mockGetCurrentAddress.mockReturnValue("0xabc");

    render(<RefBinder />);
    await new Promise((r) => setTimeout(r, 10));

    expect(mockFetchWithUserAuth).not.toHaveBeenCalled();
  });

  it("does not call API when no address", async () => {
    localStorage.setItem("qy_ref_code", "REF004");
    mockGetCurrentAddress.mockReturnValue(null);

    render(<RefBinder />);
    await new Promise((r) => setTimeout(r, 10));

    expect(mockFetchWithUserAuth).not.toHaveBeenCalled();
  });
});
