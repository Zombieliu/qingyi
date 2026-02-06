"use client";

type CacheEntry<T> = {
  value: T;
  updatedAt: number;
};

type CacheResult<T> = {
  value: T;
  updatedAt: number;
  fresh: boolean;
};

export function readCache<T>(key: string, maxAgeMs: number, allowStale = false): CacheResult<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (!parsed || parsed.updatedAt === undefined) return null;
    const fresh = Date.now() - parsed.updatedAt <= maxAgeMs;
    if (!fresh && !allowStale) return null;
    return { value: parsed.value, updatedAt: parsed.updatedAt, fresh };
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    const payload: CacheEntry<T> = { value, updatedAt: Date.now() };
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // ignore cache write errors
  }
}
