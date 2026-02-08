const test = require("node:test");
const assert = require("node:assert/strict");
const chainOrderUtils = require("../packages/app/src/lib/chain-order-utils.js");
const {
  CHAIN_ORDER_STATUS,
  isChainOrderCancelable,
  isChainOrderAutoCancelable,
  pickAutoCancelableOrders,
} = chainOrderUtils;

test("isChainOrderCancelable only allows created/paid", () => {
  assert.equal(isChainOrderCancelable(CHAIN_ORDER_STATUS.CREATED), true);
  assert.equal(isChainOrderCancelable(CHAIN_ORDER_STATUS.PAID), true);
  assert.equal(isChainOrderCancelable(CHAIN_ORDER_STATUS.DEPOSITED), false);
  assert.equal(isChainOrderCancelable(CHAIN_ORDER_STATUS.COMPLETED), false);
  assert.equal(isChainOrderCancelable(CHAIN_ORDER_STATUS.DISPUTED), false);
  assert.equal(isChainOrderCancelable(CHAIN_ORDER_STATUS.RESOLVED), false);
  assert.equal(isChainOrderCancelable(CHAIN_ORDER_STATUS.CANCELLED), false);
});

test("isChainOrderAutoCancelable respects threshold", () => {
  const now = 1_000_000;
  const thresholdMs = 60_000;
  const order = {
    orderId: "1",
    status: CHAIN_ORDER_STATUS.CREATED,
    createdAt: String(now - thresholdMs - 1),
  };
  assert.equal(isChainOrderAutoCancelable(order, now, thresholdMs), true);
  assert.equal(isChainOrderAutoCancelable(order, now, thresholdMs + 1_000), false);
});

test("pickAutoCancelableOrders filters and caps", () => {
  const now = 1_000_000;
  const thresholdMs = 60_000;
  const orders = [
    { orderId: "old", status: CHAIN_ORDER_STATUS.PAID, createdAt: String(now - 120_000) },
    { orderId: "new", status: CHAIN_ORDER_STATUS.PAID, createdAt: String(now - 30_000) },
    { orderId: "created", status: CHAIN_ORDER_STATUS.CREATED, createdAt: String(now - 90_000) },
    { orderId: "locked", status: CHAIN_ORDER_STATUS.DEPOSITED, createdAt: String(now - 999_999) },
  ];

  const picked = pickAutoCancelableOrders(orders, now, thresholdMs, 2);
  assert.equal(picked.length, 2);
  assert.equal(picked[0].orderId, "old");
  assert.equal(picked[1].orderId, "created");
});
