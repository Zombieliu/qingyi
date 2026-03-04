import "server-only";

import { toEpochMs } from "@/lib/edge-db/client";

export type EdgeDateValue = string | number | null | undefined;

export function toEdgeDate(value: EdgeDateValue, fallbackEpochMs = 0): Date {
  const epoch = toEpochMs(value);
  return new Date(epoch ?? fallbackEpochMs);
}

export function parseOptionalDateInput(value?: string | number | null): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const asNumber = Number(trimmed);
    if (Number.isFinite(asNumber)) return new Date(asNumber);
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}
