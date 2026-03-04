import "server-only";

import { fetchEdgeRows } from "@/lib/edge-db/client";

type EdgeDbAuthMode = "read" | "write";

export const EDGE_DB_DEFAULT_SCAN_PAGE_SIZE = 1_000;
export const EDGE_DB_DEFAULT_SCAN_MAX_ROWS = 50_000;

export type ScanEdgeTableRowsOptions = {
  table: string;
  baseParams: URLSearchParams;
  authMode?: EdgeDbAuthMode;
  pageSize?: number;
  maxRows?: number;
  startOffset?: number;
};

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || (value as number) <= 0) {
    return fallback;
  }
  return Math.floor(value as number);
}

function normalizeStartOffset(value: number | undefined): number {
  if (!Number.isFinite(value) || (value as number) < 0) {
    return 0;
  }
  return Math.floor(value as number);
}

export async function scanEdgeTableRows<T>(args: ScanEdgeTableRowsOptions): Promise<T[]> {
  const pageSize = normalizePositiveInteger(args.pageSize, EDGE_DB_DEFAULT_SCAN_PAGE_SIZE);
  const maxRows = normalizePositiveInteger(args.maxRows, EDGE_DB_DEFAULT_SCAN_MAX_ROWS);
  const startOffset = normalizeStartOffset(args.startOffset);
  const authMode = args.authMode ?? "read";

  const rows: T[] = [];

  for (let offset = startOffset; offset < maxRows; offset += pageSize) {
    const params = new URLSearchParams(args.baseParams);
    params.set("limit", String(pageSize));
    params.set("offset", String(offset));
    const batch = await fetchEdgeRows<T>(args.table, params, authMode);
    rows.push(...batch);
    if (batch.length < pageSize) {
      break;
    }
  }

  return rows;
}
