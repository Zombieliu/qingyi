/**
 * Feature flag system with env + Redis runtime override.
 *
 * Priority: Redis override > env var > default value
 * Client-side: reads NEXT_PUBLIC_ env vars only (no Redis)
 * Server-side: reads Redis first, then env, then default
 *
 * Admin API: POST /api/admin/feature-flags to toggle at runtime
 */

import { FeatureFlagDescriptions } from "@/lib/shared/messages";

export type FeatureFlag =
  | "dispute_flow"
  | "push_notifications"
  | "advanced_analytics"
  | "credit_system"
  | "companion_schedule"
  | "coupon_system"
  | "referral_rewards"
  | "web_vitals";

type FlagConfig = {
  defaultValue: boolean;
  description: string;
};

const FLAG_REGISTRY: Record<FeatureFlag, FlagConfig> = {
  dispute_flow: { defaultValue: false, description: FeatureFlagDescriptions.dispute_flow },
  push_notifications: {
    defaultValue: false,
    description: FeatureFlagDescriptions.push_notifications,
  },
  advanced_analytics: {
    defaultValue: false,
    description: FeatureFlagDescriptions.advanced_analytics,
  },
  credit_system: { defaultValue: true, description: FeatureFlagDescriptions.credit_system },
  companion_schedule: {
    defaultValue: true,
    description: FeatureFlagDescriptions.companion_schedule,
  },
  coupon_system: { defaultValue: true, description: FeatureFlagDescriptions.coupon_system },
  referral_rewards: { defaultValue: true, description: FeatureFlagDescriptions.referral_rewards },
  web_vitals: { defaultValue: true, description: FeatureFlagDescriptions.web_vitals },
};

// In-memory cache for server-side Redis overrides (TTL 60s)
let _overrideCache: Record<string, boolean> | null = null;
let _overrideCacheTime = 0;
const CACHE_TTL = 60_000;

async function getRedisOverrides(): Promise<Record<string, boolean>> {
  if (typeof window !== "undefined") return {}; // Client-side: no Redis
  const now = Date.now();
  if (_overrideCache && now - _overrideCacheTime < CACHE_TTL) return _overrideCache;

  try {
    const { getCache } = await import("@/lib/server-cache");
    const entry = getCache<string>("ff:overrides");
    if (entry) {
      _overrideCache = JSON.parse(entry.value);
      _overrideCacheTime = now;
      return _overrideCache!;
    }
  } catch {
    /* Redis unavailable, fall through */
  }
  return {};
}

/** Check if a feature flag is enabled (client + server) */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  // Sync check: env var > default
  const envKey = `NEXT_PUBLIC_FF_${flag.toUpperCase()}`;
  const envVal = typeof process !== "undefined" ? process.env[envKey] : undefined;
  if (envVal === "1") return true;
  if (envVal === "0") return false;
  return FLAG_REGISTRY[flag]?.defaultValue ?? false;
}

/** Async check with Redis override (server-side only) */
export async function isFeatureEnabledAsync(flag: FeatureFlag): Promise<boolean> {
  const overrides = await getRedisOverrides();
  if (flag in overrides) return overrides[flag];
  return isFeatureEnabled(flag);
}

/** Set a runtime override via Redis */
export async function setFlagOverride(flag: FeatureFlag, enabled: boolean): Promise<void> {
  try {
    const { getCache, setCache } = await import("@/lib/server-cache");
    const entry = getCache<string>("ff:overrides");
    const overrides: Record<string, boolean> = entry ? JSON.parse(entry.value) : {};
    overrides[flag] = enabled;
    setCache("ff:overrides", JSON.stringify(overrides), 86400_000);
    // Invalidate local cache
    _overrideCache = overrides;
    _overrideCacheTime = Date.now();
  } catch (err) {
    console.error("[FeatureFlags] Failed to set override:", err);
    throw err;
  }
}

/** Remove a runtime override (revert to env/default) */
export async function clearFlagOverride(flag: FeatureFlag): Promise<void> {
  try {
    const { getCache, setCache } = await import("@/lib/server-cache");
    const entry = getCache<string>("ff:overrides");
    const overrides: Record<string, boolean> = entry ? JSON.parse(entry.value) : {};
    delete overrides[flag];
    setCache("ff:overrides", JSON.stringify(overrides), 86400_000);
    _overrideCache = overrides;
    _overrideCacheTime = Date.now();
  } catch (err) {
    console.error("[FeatureFlags] Failed to clear override:", err);
  }
}

/** Get all flags with current values (sync, no Redis) */
export function getAllFlags(): Array<{ flag: FeatureFlag; enabled: boolean; description: string }> {
  return (Object.keys(FLAG_REGISTRY) as FeatureFlag[]).map((flag) => ({
    flag,
    enabled: isFeatureEnabled(flag),
    description: FLAG_REGISTRY[flag].description,
  }));
}

/** Get all flags with Redis overrides (async, server-side) */
export async function getAllFlagsAsync(): Promise<
  Array<{
    flag: FeatureFlag;
    enabled: boolean;
    description: string;
    source: "redis" | "env" | "default";
  }>
> {
  const overrides = await getRedisOverrides();
  return (Object.keys(FLAG_REGISTRY) as FeatureFlag[]).map((flag) => {
    const envKey = `NEXT_PUBLIC_FF_${flag.toUpperCase()}`;
    const envVal = typeof process !== "undefined" ? process.env[envKey] : undefined;

    let enabled: boolean;
    let source: "redis" | "env" | "default";

    if (flag in overrides) {
      enabled = overrides[flag];
      source = "redis";
    } else if (envVal === "1" || envVal === "0") {
      enabled = envVal === "1";
      source = "env";
    } else {
      enabled = FLAG_REGISTRY[flag].defaultValue;
      source = "default";
    }

    return { flag, enabled, description: FLAG_REGISTRY[flag].description, source };
  });
}

export function getFlagRegistry() {
  return FLAG_REGISTRY;
}
