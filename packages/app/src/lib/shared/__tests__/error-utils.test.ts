import { describe, it, expect } from "vitest";
import { formatErrorMessage, extractErrorMessage } from "../../shared/error-utils";

describe("formatErrorMessage", () => {
  it("formats Error instance with fallback prefix", () => {
    const err = new Error("connection timeout");
    expect(formatErrorMessage(err, "操作失败")).toBe("操作失败：connection timeout");
  });

  it("formats string error with fallback prefix", () => {
    expect(formatErrorMessage("bad request", "操作失败")).toBe("操作失败：bad request");
  });

  it("formats object with message property", () => {
    expect(formatErrorMessage({ message: "not found" }, "操作失败")).toBe("操作失败：not found");
  });

  it("returns fallback for empty error", () => {
    expect(formatErrorMessage(new Error(""), "操作失败")).toBe("操作失败");
    expect(formatErrorMessage("", "操作失败")).toBe("操作失败");
    expect(formatErrorMessage(null, "操作失败")).toBe("操作失败");
    expect(formatErrorMessage(undefined, "操作失败")).toBe("操作失败");
  });

  it("returns fallback when message equals fallback", () => {
    expect(formatErrorMessage(new Error("操作失败"), "操作失败")).toBe("操作失败");
    expect(formatErrorMessage("操作失败", "操作失败")).toBe("操作失败");
  });

  it("formats object with error/code/status properties", () => {
    expect(formatErrorMessage({ error: "forbidden" }, "操作失败")).toBe("操作失败：forbidden");
    expect(formatErrorMessage({ code: "ENOENT" }, "操作失败")).toBe("操作失败：ENOENT");
  });
});

describe("extractErrorMessage", () => {
  it("extracts from Error instance", () => {
    expect(extractErrorMessage(new Error("timeout"))).toBe("timeout");
  });

  it("extracts from string", () => {
    expect(extractErrorMessage("  some error  ")).toBe("some error");
  });

  it("extracts from object with message property", () => {
    expect(extractErrorMessage({ message: "not found" })).toBe("not found");
  });

  it("extracts from object with error property", () => {
    expect(extractErrorMessage({ error: "forbidden" })).toBe("forbidden");
  });

  it("extracts from object with code property", () => {
    expect(extractErrorMessage({ code: "ENOENT" })).toBe("ENOENT");
  });

  it("extracts from object with status property", () => {
    expect(extractErrorMessage({ status: "500 Internal" })).toBe("500 Internal");
  });

  it("returns empty string for null/undefined", () => {
    expect(extractErrorMessage(null)).toBe("");
    expect(extractErrorMessage(undefined)).toBe("");
  });

  it("returns empty string for object with no recognized properties", () => {
    expect(extractErrorMessage({ foo: "bar" })).toBe("");
  });
});
