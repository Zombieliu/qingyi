export type ChainSponsorMode = "auto" | "on" | "off";

const SPONSOR_STRICT_VALUES = new Set(["1", "on", "true"]);
const SPONSOR_DISABLED_VALUES = new Set(["0", "off", "false"]);

export function normalizeChainSponsorMode(value: string | undefined | null): ChainSponsorMode {
  const mode = String(value ?? "auto")
    .trim()
    .toLowerCase();
  if (SPONSOR_STRICT_VALUES.has(mode)) return "on";
  if (SPONSOR_DISABLED_VALUES.has(mode)) return "off";
  return "auto";
}

export function getChainSponsorPolicy(value: string | undefined | null) {
  const mode = normalizeChainSponsorMode(value);
  return {
    mode,
    enabled: mode !== "off",
    strict: mode === "on",
  } as const;
}
