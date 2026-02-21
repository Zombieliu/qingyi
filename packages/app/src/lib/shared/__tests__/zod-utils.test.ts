import { describe, it, expect } from "vitest";
import { z } from "zod";
import { suiAddress, optionalSuiAddress } from "../zod-utils";

describe("suiAddress", () => {
  it("accepts and normalizes a valid SUI address", () => {
    const valid = "0x" + "a".repeat(64);
    const schema = z.object({ addr: suiAddress });
    const result = schema.safeParse({ addr: valid });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.addr).toMatch(/^0x[0-9a-f]{64}$/);
    }
  });

  it("rejects an invalid SUI address", () => {
    const schema = z.object({ addr: suiAddress });
    const result = schema.safeParse({ addr: "not-an-address" });
    expect(result.success).toBe(false);
  });

  it("rejects empty string", () => {
    const schema = z.object({ addr: suiAddress });
    const result = schema.safeParse({ addr: "" });
    expect(result.success).toBe(false);
  });
});

describe("optionalSuiAddress", () => {
  it("accepts undefined", () => {
    const schema = z.object({ addr: optionalSuiAddress });
    const result = schema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.addr).toBeUndefined();
    }
  });

  it("accepts and normalizes a valid address", () => {
    const valid = "0x" + "b".repeat(64);
    const schema = z.object({ addr: optionalSuiAddress });
    const result = schema.safeParse({ addr: valid });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.addr).toMatch(/^0x[0-9a-f]{64}$/);
    }
  });

  it("rejects an invalid address when provided", () => {
    const schema = z.object({ addr: optionalSuiAddress });
    const result = schema.safeParse({ addr: "bad" });
    expect(result.success).toBe(false);
  });
});
