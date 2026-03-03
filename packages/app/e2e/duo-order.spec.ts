import { test, expect } from "@playwright/test";

test.describe("Duo order API", () => {
  test("release-slot returns 404 for nonexistent order", async ({ request }) => {
    const res = await request.post("/api/duo-orders/nonexistent-id/release-slot", {
      data: { companionAddress: "0x" + "a".repeat(64) },
    });
    expect(res.status()).toBe(404);
  });

  test("release-slot rejects without auth", async ({ request }) => {
    const res = await request.post("/api/duo-orders/test-order/release-slot", {
      data: { companionAddress: "0x" + "a".repeat(64) },
    });
    // Should be 404 (order not found) or 401 (auth required), not 500
    expect([400, 401, 403, 404]).toContain(res.status());
  });

  test("duo-orders list API responds", async ({ request }) => {
    const res = await request.get("/api/duo-orders");
    // May return 200 or 401 depending on auth
    expect([200, 401, 403]).toContain(res.status());
  });
});
