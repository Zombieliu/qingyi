import "server-only";
import { cookies, headers } from "next/headers";
import zh from "@/i18n/messages/zh.json";
import en from "@/i18n/messages/en.json";
import { DEFAULT_LOCALE, LOCALE_COOKIE, type Locale } from "./i18n-shared";

const MESSAGES: Record<Locale, Record<string, string>> = {
  zh,
  en,
};

function normalizeLocale(value?: string | null): Locale | null {
  if (!value) return null;
  const lowered = value.toLowerCase();
  if (lowered.startsWith("zh")) return "zh";
  if (lowered.startsWith("en")) return "en";
  return null;
}

export async function getServerLocale(): Promise<Locale> {
  const cookieLocale = normalizeLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  if (cookieLocale) return cookieLocale;
  const headerLocale = normalizeLocale((await headers()).get("accept-language"));
  return headerLocale || DEFAULT_LOCALE;
}

export function getMessages(locale: Locale) {
  return MESSAGES[locale] || MESSAGES[DEFAULT_LOCALE];
}

export function createTranslator(messages: Record<string, string>) {
  return (key: string, fallback?: string) => messages[key] || fallback || key;
}
