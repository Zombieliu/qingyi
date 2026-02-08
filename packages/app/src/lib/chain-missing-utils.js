function isNumericId(value) {
  return typeof value === "string" && /^[0-9]+$/.test(value);
}

function computeMissingChainCleanup({
  chainOrders,
  localOrders,
  maxAgeHours = 0,
  maxDelete = 500,
  nowMs = Date.now(),
  chainOnly = false,
} = {}) {
  const chainIds = new Set((chainOrders || []).map((order) => order.orderId));
  const missing = (localOrders || []).filter((order) => isNumericId(order.id) && !chainIds.has(order.id));
  let eligible = missing;
  let cutoff = null;

  if (Number.isFinite(maxAgeHours) && maxAgeHours > 0) {
    cutoff = nowMs - maxAgeHours * 60 * 60 * 1000;
    eligible = missing.filter((order) => {
      if (chainOnly && order.source !== "chain") return false;
      if (!Number.isFinite(order.createdAt)) return false;
      return order.createdAt < cutoff;
    });
  } else if (chainOnly) {
    eligible = missing.filter((order) => order.source === "chain");
  }

  const limit = Number.isFinite(maxDelete) && maxDelete > 0 ? Math.floor(maxDelete) : 500;
  const ids = eligible.slice(0, limit).map((order) => order.id);

  return { missing, eligible, ids, cutoff, limit };
}

module.exports = {
  computeMissingChainCleanup,
};
