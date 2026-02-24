import { describe, it, expect } from "vitest";
import { decodeCursorParam, encodeCursorParam, type CursorPayload } from "../cursor-utils";

describe("cursor-utils", () => {
  describe("encodeCursorParam", () => {
    it("encodes a cursor payload to base64url", () => {
      const cursor: CursorPayload = { createdAt: 1700000000000, id: "abc123" };
      const encoded = encodeCursorParam(cursor);
      expect(encoded).toBeTruthy();
      expect(typeof encoded).toBe("string");
    });

    it("returns null for null input", () => {
      expect(encodeCursorParam(null)).toBeNull();
    });
  });

  describe("decodeCursorParam", () => {
    it("decodes a valid encoded cursor", () => {
      const cursor: CursorPayload = { createdAt: 1700000000000, id: "abc123" };
      const encoded = encodeCursorParam(cursor)!;
      const decoded = decodeCursorParam(encoded);
      expect(decoded).toEqual(cursor);
    });

    it("returns null for null input", () => {
      expect(decodeCursorParam(null)).toBeNull();
    });

    it("returns null for undefined input", () => {
      expect(decodeCursorParam(undefined)).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(decodeCursorParam("")).toBeNull();
    });

    it("returns null for invalid base64", () => {
      expect(decodeCursorParam("not-valid-base64!!!")).toBeNull();
    });

    it("returns null for valid base64 but invalid payload", () => {
      const encoded = Buffer.from(JSON.stringify({ foo: "bar" }), "utf8").toString("base64url");
      expect(decodeCursorParam(encoded)).toBeNull();
    });

    it("returns null for payload missing id", () => {
      const encoded = Buffer.from(JSON.stringify({ createdAt: 123 }), "utf8").toString("base64url");
      expect(decodeCursorParam(encoded)).toBeNull();
    });

    it("returns null for payload missing createdAt", () => {
      const encoded = Buffer.from(JSON.stringify({ id: "abc" }), "utf8").toString("base64url");
      expect(decodeCursorParam(encoded)).toBeNull();
    });
  });

  describe("roundtrip", () => {
    it("encode then decode returns original", () => {
      const cursor: CursorPayload = { createdAt: 1234567890, id: "test-id" };
      const result = decodeCursorParam(encodeCursorParam(cursor)!);
      expect(result).toEqual(cursor);
    });
  });
});
