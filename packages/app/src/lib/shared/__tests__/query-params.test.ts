import { describe, it, expect } from "vitest";
import { parseIntegerQueryParam } from "../query-params";

describe("parseIntegerQueryParam", () => {
  it("returns fallback for nullish and empty values", () => {
    expect(parseIntegerQueryParam(null, { fallback: 7 })).toBe(7);
    expect(parseIntegerQueryParam(undefined, { fallback: 7 })).toBe(7);
    expect(parseIntegerQueryParam("", { fallback: 7 })).toBe(7);
  });

  it("returns fallback for non-finite numbers", () => {
    expect(parseIntegerQueryParam("abc", { fallback: 9 })).toBe(9);
    expect(parseIntegerQueryParam("Infinity", { fallback: 9 })).toBe(9);
    expect(parseIntegerQueryParam("NaN", { fallback: 9 })).toBe(9);
  });

  it("clamps with min and max after truncation", () => {
    expect(parseIntegerQueryParam("12.9", { fallback: 1 })).toBe(12);
    expect(parseIntegerQueryParam("-2.5", { fallback: 1, min: 1 })).toBe(1);
    expect(parseIntegerQueryParam("999", { fallback: 1, max: 200 })).toBe(200);
  });
});
