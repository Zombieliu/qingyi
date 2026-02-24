import { describe, it, expect, vi, beforeEach } from "vitest";
import { AUTH_MESSAGE_VERSION, buildAuthMessage, type AuthMessageParams } from "../auth-message";

describe("auth-message", () => {
  describe("AUTH_MESSAGE_VERSION", () => {
    it("is qy-auth-v2", () => {
      expect(AUTH_MESSAGE_VERSION).toBe("qy-auth-v2");
    });
  });

  describe("buildAuthMessage", () => {
    it("builds message with all fields", () => {
      const params: AuthMessageParams = {
        intent: "login",
        address: "0xABC123",
        timestamp: 1700000000,
        nonce: "nonce123",
        bodyHash: "hash456",
      };
      const result = buildAuthMessage(params);
      expect(result).toBe("qy-auth-v2|login|0xabc123|1700000000|nonce123|hash456");
    });

    it("lowercases and trims address", () => {
      const params: AuthMessageParams = {
        intent: "login",
        address: "  0xABCDEF  ",
        timestamp: 123,
        nonce: "n",
      };
      const result = buildAuthMessage(params);
      expect(result).toContain("|0xabcdef|");
    });

    it("uses empty string when bodyHash is undefined", () => {
      const params: AuthMessageParams = {
        intent: "sign",
        address: "0x1",
        timestamp: 100,
        nonce: "abc",
      };
      const result = buildAuthMessage(params);
      expect(result).toBe("qy-auth-v2|sign|0x1|100|abc|");
    });

    it("trims bodyHash", () => {
      const params: AuthMessageParams = {
        intent: "sign",
        address: "0x1",
        timestamp: 100,
        nonce: "abc",
        bodyHash: "  hash  ",
      };
      const result = buildAuthMessage(params);
      expect(result).toBe("qy-auth-v2|sign|0x1|100|abc|hash");
    });

    it("includes all pipe-separated segments", () => {
      const params: AuthMessageParams = {
        intent: "test",
        address: "0x0",
        timestamp: 0,
        nonce: "n",
        bodyHash: "h",
      };
      const result = buildAuthMessage(params);
      const parts = result.split("|");
      expect(parts).toHaveLength(6);
      expect(parts[0]).toBe(AUTH_MESSAGE_VERSION);
      expect(parts[1]).toBe("test");
      expect(parts[2]).toBe("0x0");
      expect(parts[3]).toBe("0");
      expect(parts[4]).toBe("n");
      expect(parts[5]).toBe("h");
    });
  });
});
