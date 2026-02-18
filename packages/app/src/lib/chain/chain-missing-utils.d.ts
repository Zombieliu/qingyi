export type ChainOrderLike = {
  orderId: string;
};

export type LocalOrderLike = {
  id: string;
  source?: string | null;
  createdAt?: number | null;
};

export type MissingChainCleanupOptions = {
  chainOrders?: ChainOrderLike[];
  localOrders?: LocalOrderLike[];
  maxAgeHours?: number;
  maxDelete?: number;
  nowMs?: number;
  chainOnly?: boolean;
};

export type MissingChainCleanupResult = {
  missing: LocalOrderLike[];
  eligible: LocalOrderLike[];
  ids: string[];
  cutoff: number | null;
  limit: number;
};

export function computeMissingChainCleanup(
  options?: MissingChainCleanupOptions
): MissingChainCleanupResult;
