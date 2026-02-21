import { describe, it, expect } from "vitest";
import {
  formatShortDateTime,
  formatFullDateTime,
  formatDateISO,
  formatRelativeTime,
} from "../date-utils";

// Fixed timestamp: 2025-01-15 14:30:00 Asia/Shanghai (UTC+8)
// = 2025-01-15 06:30:00 UTC
const ts = new Date("2025-01-15T06:30:00Z").getTime();

describe("formatShortDateTime", () => {
  it("formats as MM/dd HH:mm", () => {
    expect(formatShortDateTime(ts)).toBe("01/15 14:30");
  });
});

describe("formatFullDateTime", () => {
  it("formats as yyyy/MM/dd HH:mm", () => {
    expect(formatFullDateTime(ts)).toBe("2025/01/15 14:30");
  });
});

describe("formatDateISO", () => {
  it("formats as yyyy-MM-dd", () => {
    expect(formatDateISO(ts)).toBe("2025-01-15");
  });
});

describe("formatRelativeTime", () => {
  it("returns a string with suffix", () => {
    const result = formatRelativeTime(ts);
    expect(result).toContain("前");
  });
});
