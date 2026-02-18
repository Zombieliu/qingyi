const CHAIN_ORDER_STATUS = {
  CREATED: 0,
  PAID: 1,
  DEPOSITED: 2,
  COMPLETED: 3,
  DISPUTED: 4,
  RESOLVED: 5,
  CANCELLED: 6,
};

function parseChainTimestamp(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return num;
}

function isChainOrderCancelable(status) {
  return status === CHAIN_ORDER_STATUS.CREATED || status === CHAIN_ORDER_STATUS.PAID;
}

function isChainOrderAutoCancelable(order, nowMs, thresholdMs) {
  if (!order) return false;
  if (!Number.isFinite(nowMs) || nowMs <= 0) return false;
  if (!Number.isFinite(thresholdMs) || thresholdMs <= 0) return false;
  const createdAt = parseChainTimestamp(order.createdAt);
  if (createdAt <= 0) return false;
  return isChainOrderCancelable(order.status) && nowMs - createdAt >= thresholdMs;
}

function pickAutoCancelableOrders(orders, nowMs, thresholdMs, limit) {
  if (!Array.isArray(orders) || orders.length === 0) return [];
  const capped = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : orders.length;
  return orders
    .filter((order) => isChainOrderAutoCancelable(order, nowMs, thresholdMs))
    .sort((a, b) => parseChainTimestamp(a.createdAt) - parseChainTimestamp(b.createdAt))
    .slice(0, capped);
}

module.exports = {
  CHAIN_ORDER_STATUS,
  parseChainTimestamp,
  isChainOrderCancelable,
  isChainOrderAutoCancelable,
  pickAutoCancelableOrders,
};
