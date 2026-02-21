export function getLocalChainStatus(
  order?: { chainStatus?: number; meta?: Record<string, unknown> } | null
) {
  if (!order) return undefined;
  const meta = (order.meta || {}) as { chain?: { status?: number } };
  const status = order.chainStatus ?? meta.chain?.status;
  return typeof status === "number" ? status : undefined;
}

export function mergeChainStatus(local?: number, remote?: number) {
  if (typeof local === "number" && typeof remote === "number") {
    return Math.max(local, remote);
  }
  return typeof local === "number" ? local : remote;
}
