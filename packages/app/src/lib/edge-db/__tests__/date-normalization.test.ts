import { describe, expect, it } from "vitest";

import { parseOptionalDateInput, toEdgeDate } from "../date-normalization";

describe("edge db date normalization", () => {
  it("maps edge time values to Date with default fallback", () => {
    expect(toEdgeDate("2026-03-01T00:00:00.000Z").toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(toEdgeDate(1_700_000_000_000).getTime()).toBe(1_700_000_000_000);
    expect(toEdgeDate("invalid-date").getTime()).toBe(0);
    expect(toEdgeDate(undefined).getTime()).toBe(0);
  });

  it("supports custom fallback epoch when edge date is invalid", () => {
    expect(toEdgeDate("invalid-date", 1234).getTime()).toBe(1234);
  });

  it("parses flexible route date inputs", () => {
    expect(parseOptionalDateInput(undefined)).toBeNull();
    expect(parseOptionalDateInput(null)).toBeNull();
    expect(parseOptionalDateInput("")).toBeNull();
    expect(parseOptionalDateInput("   ")).toBeNull();
    expect(parseOptionalDateInput(1_700_000_000_000)?.getTime()).toBe(1_700_000_000_000);
    expect(parseOptionalDateInput("1700000000000")?.getTime()).toBe(1_700_000_000_000);
    expect(parseOptionalDateInput("2026-01-10T12:34:56.000Z")?.toISOString()).toBe(
      "2026-01-10T12:34:56.000Z"
    );
    expect(parseOptionalDateInput("not-a-date")).toBeNull();
  });
});
