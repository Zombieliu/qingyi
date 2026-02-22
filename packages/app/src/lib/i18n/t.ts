/**
 * Universal translation function — works in both Server and Client Components.
 * For React hooks (useI18n), use i18n-client.ts instead.
 */

import { DEFAULT_LOCALE, LOCALE_COOKIE, type Locale } from "./i18n-shared";
import zh from "@/i18n/messages/zh.json";
import en from "@/i18n/messages/en.json";

const MESSAGES: Record<Locale, Record<string, string>> = { zh, en };

function detectLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const fromStorage = localStorage.getItem("qy_locale");
    if (fromStorage?.startsWith("zh")) return "zh";
    if (fromStorage?.startsWith("en")) return "en";
  } catch {
    /* SSR or restricted */
  }
  try {
    const cookieMatch = document.cookie.match(new RegExp(`${LOCALE_COOKIE}=([^;]+)`));
    const c = cookieMatch?.[1];
    if (c?.startsWith("zh")) return "zh";
    if (c?.startsWith("en")) return "en";
  } catch {
    /* SSR */
  }
  try {
    if (navigator.language.startsWith("en")) return "en";
  } catch {
    /* SSR */
  }
  return DEFAULT_LOCALE;
}

/**
 * Standalone translation function.
 * Works in Server Components (returns default locale),
 * Client Components, event handlers, helpers — anywhere.
 *
 * Supports interpolation: t("key", { count: 3 }) replaces {{count}}.
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const locale = detectLocale();
  const messages = MESSAGES[locale] || MESSAGES[DEFAULT_LOCALE];
  let msg = messages[key] || key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      msg = msg.replaceAll(`{{${k}}}`, String(v));
    }
  }
  return msg;
}
