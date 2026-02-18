"use client";

import { useCallback, useMemo, useState } from "react";
import { DEFAULT_LOCALE, LOCALE_COOKIE, SUPPORTED_LOCALES, type Locale } from "./i18n-shared";
import zh from "@/i18n/messages/zh.json";
import en from "@/i18n/messages/en.json";

const STORAGE_KEY = "qy_locale";

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

export function getClientLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  const fromStorage = normalizeLocale(localStorage.getItem(STORAGE_KEY));
  if (fromStorage) return fromStorage;
  const cookieMatch = document.cookie.match(new RegExp(`${LOCALE_COOKIE}=([^;]+)`));
  const fromCookie = normalizeLocale(cookieMatch?.[1] || null);
  if (fromCookie) return fromCookie;
  const fromNavigator = normalizeLocale(navigator.language);
  return fromNavigator || DEFAULT_LOCALE;
}

export function setClientLocale(next: Locale) {
  if (typeof window === "undefined") return;
  if (!SUPPORTED_LOCALES.includes(next)) return;
  localStorage.setItem(STORAGE_KEY, next);
  document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=31536000`;
}

export function useI18n() {
  const [locale, setLocaleState] = useState<Locale>(getClientLocale());

  const setLocale = useCallback((next: Locale) => {
    setClientLocale(next);
    setLocaleState(next);
  }, []);

  const messages = useMemo(() => MESSAGES[locale] || MESSAGES[DEFAULT_LOCALE], [locale]);
  const t = useCallback((key: string, fallback?: string) => messages[key] || fallback || key, [messages]);

  return { locale, setLocale, t };
}
