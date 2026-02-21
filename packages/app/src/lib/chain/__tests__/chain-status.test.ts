import { describe, it, expect } from "vitest";
import { getLocalChainStatus, mergeChainStatus } from "../chain-status";

describe("getLocalChainStatus", () => {
  it("returns undefined for null/undefined order", () => {
    expect(getLocalChainStatus(null)).toBeUndefined();
    expect(getLocalChainStatus(undefined)).toBeUndefined();
  });

  it("returns chainStatus from order directly", () => {
    expect(getLocalChainStatus({ chainStatus: 3 })).toBe(3);
  });

  it("returns chainStatus from meta.chain.status", () => {
    expect(getLocalChainStatus({ meta: { chain: { status: 5 } } })).toBe(5);
  });

  it("prefers order.chainStatus over meta", () => {
    expect(getLocalChainStatus({ chainStatus: 2, meta: { chain: { status: 7 } } })).toBe(2);
  });

  it("returns undefined when no status present", () => {
    expect(getLocalChainStatus({})).toBeUndefined();
    expect(getLocalChainStatus({ meta: {} })).toBeUndefined();
  });
});

describe("mergeChainStatus", () => {
  it("returns max when both defined", () => {
    expect(mergeChainStatus(3, 5)).toBe(5);
    expect(mergeChainStatus(7, 2)).toBe(7);
  });

  it("returns local when only local defined", () => {
    expect(mergeChainStatus(4, undefined)).toBe(4);
  });

  it("returns remote when only remote defined", () => {
    expect(mergeChainStatus(undefined, 6)).toBe(6);
  });

  it("returns undefined when both undefined", () => {
    expect(mergeChainStatus(undefined, undefined)).toBeUndefined();
  });
});
