const test = require("node:test");
const assert = require("node:assert/strict");

const { computeMissingChainCleanup } = require("../packages/app/src/lib/chain-missing-utils.js");

test("computeMissingChainCleanup returns all missing numeric orders when maxAgeHours=0", () => {
  const chainOrders = [{ orderId: "1" }, { orderId: "2" }];
  const localOrders = [
    { id: "1", source: "chain", createdAt: 1 },
    { id: "3", source: "app", createdAt: 2 },
    { id: "ORD-4", source: "app", createdAt: 3 },
  ];

  const result = computeMissingChainCleanup({
    chainOrders,
    localOrders,
    maxAgeHours: 0,
    chainOnly: false,
  });

  assert.equal(result.missing.length, 1);
  assert.deepEqual(result.ids, ["3"]);
});

test("computeMissingChainCleanup respects age + chainOnly + maxDelete", () => {
  const now = Date.now();
  const chainOrders = [{ orderId: "1" }];
  const localOrders = [
    { id: "2", source: "chain", createdAt: now - 1000 * 60 * 60 * 25 },
    { id: "3", source: "chain", createdAt: now - 1000 * 60 * 60 * 2 },
    { id: "4", source: "app", createdAt: now - 1000 * 60 * 60 * 30 },
    { id: "ORD-5", source: "app", createdAt: now - 1000 * 60 * 60 * 30 },
  ];

  const result = computeMissingChainCleanup({
    chainOrders,
    localOrders,
    maxAgeHours: 24,
    maxDelete: 1,
    nowMs: now,
    chainOnly: true,
  });

  assert.equal(result.missing.length, 3);
  assert.equal(result.eligible.length, 1);
  assert.deepEqual(result.ids, ["2"]);
});
