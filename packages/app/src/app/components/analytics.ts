"use client";

import { getCurrentAddress } from "@/lib/qy-chain";

const CLIENT_ID_KEY = "qy_client_id_v1";
const SESSION_KEY = "qy_session_id_v1";
const ATTR_KEY = "qy_attribution_v1";
const SESSION_TTL_MS = 30 * 60 * 1000;

type Attribution = {
  utm?: Record<string, string>;
  firstReferrer?: string;
  firstLanding?: string;
  firstSeenAt?: number;
};

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function getClientId() {
  if (typeof window === "undefined") return "";
  const existing = window.localStorage.getItem(CLIENT_ID_KEY);
  if (existing) return existing;
  const next = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  window.localStorage.setItem(CLIENT_ID_KEY, next);
  return next;
}

function getSessionId() {
  if (typeof window === "undefined") return "";
  const now = Date.now();
  const existing = safeParse<{ id: string; lastSeen: number }>(window.localStorage.getItem(SESSION_KEY));
  if (existing && now - existing.lastSeen < SESSION_TTL_MS) {
    const refreshed = { ...existing, lastSeen: now };
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(refreshed));
    return existing.id;
  }
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${now}-${Math.random()}`;
  window.localStorage.setItem(SESSION_KEY, JSON.stringify({ id, lastSeen: now }));
  return id;
}

function captureAttribution() {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const utmKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
  const utm: Record<string, string> = {};
  let hasUtm = false;
  utmKeys.forEach((key) => {
    const value = params.get(key);
    if (value) {
      utm[key] = value;
      hasUtm = true;
    }
  });
  const existing = safeParse<Attribution>(window.localStorage.getItem(ATTR_KEY));
  if (existing && !hasUtm) return;
  const next: Attribution = {
    utm: hasUtm ? utm : existing?.utm,
    firstReferrer: existing?.firstReferrer || (document.referrer || ""),
    firstLanding: existing?.firstLanding || window.location.pathname,
    firstSeenAt: existing?.firstSeenAt || Date.now(),
  };
  window.localStorage.setItem(ATTR_KEY, JSON.stringify(next));
}

function readAttribution(): Attribution | null {
  if (typeof window === "undefined") return null;
  return safeParse<Attribution>(window.localStorage.getItem(ATTR_KEY));
}

export function trackEvent(event: string, meta?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  captureAttribution();
  const attribution = readAttribution();
  const clientId = getClientId();
  const sessionId = getSessionId();
  let address = "";
  try {
    address = getCurrentAddress();
  } catch {
    address = "";
  }
  const payload = {
    event,
    clientId,
    sessionId,
    userAddress: address || undefined,
    path: window.location.pathname,
    referrer: document.referrer || undefined,
    ua: navigator.userAgent,
    createdAt: Date.now(),
    meta: {
      ...(attribution ? { attribution } : {}),
      ...(meta || {}),
    },
  };
  const body = JSON.stringify(payload);
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/track", blob);
    } else {
      fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      });
    }
  } catch {
    // ignore
  }
}

export function syncAttributionFromLocation() {
  captureAttribution();
}
