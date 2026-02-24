import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    NEXT_PUBLIC_QY_RULESET_ID: "100",
    NEXT_PUBLIC_QY_RULESET_ID_L1: "101",
    NEXT_PUBLIC_QY_RULESET_ID_L2: "102",
    NEXT_PUBLIC_QY_RULESET_ID_L3: "103",
    NEXT_PUBLIC_QY_RULESET_ID_L4: "104",
  },
}));

import { resolveDisputePolicy } from "../risk-policy";

describe("risk-policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 24h for default tier (no level)", () => {
    const policy = resolveDisputePolicy();
    expect(policy.hours).toBe(24);
  });

  it("returns 24h for level 0", () => {
    const policy = resolveDisputePolicy(0);
    expect(policy.hours).toBe(24);
  });

  it("returns 24h for level 1", () => {
    const policy = resolveDisputePolicy(1);
    expect(policy.hours).toBe(24);
  });

  it("returns 36h for level 2", () => {
    const policy = resolveDisputePolicy(2);
    expect(policy.hours).toBe(36);
  });

  it("returns 48h for level 3", () => {
    const policy = resolveDisputePolicy(3);
    expect(policy.hours).toBe(48);
  });

  it("returns 72h for level 4+", () => {
    const policy4 = resolveDisputePolicy(4);
    expect(policy4.hours).toBe(72);
    const policy5 = resolveDisputePolicy(5);
    expect(policy5.hours).toBe(72);
    const policy99 = resolveDisputePolicy(99);
    expect(policy99.hours).toBe(72);
  });

  it("uses correct ruleSetId for each tier", () => {
    expect(resolveDisputePolicy(0).ruleSetId).toBe("101");
    expect(resolveDisputePolicy(1).ruleSetId).toBe("101");
    expect(resolveDisputePolicy(2).ruleSetId).toBe("102");
    expect(resolveDisputePolicy(3).ruleSetId).toBe("103");
    expect(resolveDisputePolicy(4).ruleSetId).toBe("104");
  });

  describe("normalizeRuleSet handles invalid values", () => {
    it("falls back to default for non-numeric ruleSetId", async () => {
      vi.resetModules();
      vi.doMock("@/lib/env", () => ({
        env: {
          NEXT_PUBLIC_QY_RULESET_ID: "50",
          NEXT_PUBLIC_QY_RULESET_ID_L1: "not-a-number",
          NEXT_PUBLIC_QY_RULESET_ID_L2: undefined,
          NEXT_PUBLIC_QY_RULESET_ID_L3: "",
          NEXT_PUBLIC_QY_RULESET_ID_L4: "abc!",
        },
      }));
      const { resolveDisputePolicy: resolve } = await import("../risk-policy");
      // L1 has "not-a-number" -> falls back to default ("50")
      expect(resolve(0).ruleSetId).toBe("50");
      // L2 is undefined -> falls back to default
      expect(resolve(2).ruleSetId).toBe("50");
      // L3 is "" -> falsy -> falls back to default
      expect(resolve(3).ruleSetId).toBe("50");
      // L4 has "abc!" -> not numeric -> falls back to default
      expect(resolve(4).ruleSetId).toBe("50");
    });
  });
});
