import "server-only";

type IntegerQueryOptions = {
  fallback: number;
  min?: number;
  max?: number;
};

export function parseIntegerQueryParam(
  raw: string | null | undefined,
  options: IntegerQueryOptions
): number {
  if (raw === null || raw === undefined || raw === "") return options.fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return options.fallback;

  let normalized = Math.trunc(parsed);
  if (options.min !== undefined) normalized = Math.max(options.min, normalized);
  if (options.max !== undefined) normalized = Math.min(options.max, normalized);
  return normalized;
}
