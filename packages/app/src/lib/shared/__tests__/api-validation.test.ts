import { describe, it, expect } from "vitest";
import { z } from "zod";
import { parseBody, parseBodyRaw } from "../api-validation";

const schema = z.object({
  name: z.string().min(1),
  age: z.number(),
});

function makeRequest(body: unknown): Request {
  return new Request("http://localhost", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeBadRequest(body: string): Request {
  return new Request("http://localhost", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

describe("parseBody", () => {
  it("parses valid JSON body", async () => {
    const req = makeRequest({ name: "Alice", age: 30 });
    const result = await parseBody(req, schema);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: "Alice", age: 30 });
    }
  });

  it("returns 400 for invalid JSON", async () => {
    const req = makeBadRequest("not json{");
    const result = await parseBody(req, schema);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.response.status).toBe(400);
    }
  });

  it("returns 400 for missing required fields", async () => {
    const req = makeRequest({ name: "" });
    const result = await parseBody(req, schema);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.response.status).toBe(400);
    }
  });
});

describe("parseBodyRaw", () => {
  it("parses valid JSON and returns rawBody", async () => {
    const req = makeRequest({ name: "Bob", age: 25 });
    const result = await parseBodyRaw(req, schema);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: "Bob", age: 25 });
      expect(result.rawBody).toBe(JSON.stringify({ name: "Bob", age: 25 }));
    }
  });

  it("returns 400 for invalid JSON", async () => {
    const req = makeBadRequest("{broken");
    const result = await parseBodyRaw(req, schema);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.response.status).toBe(400);
    }
  });

  it("returns 400 for schema validation failure", async () => {
    const req = makeRequest({ name: 123, age: "not a number" });
    const result = await parseBodyRaw(req, schema);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.response.status).toBe(400);
    }
  });
});
