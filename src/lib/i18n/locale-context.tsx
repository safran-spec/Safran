"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { localeFromCookieValue, type Locale } from "@/lib/i18n/locale";
import { messages, type MessageKey } from "@/lib/i18n/messages";

export { localeFromCookieValue } from "@/lib/i18n/locale";

const DEFAULT_STORAGE_KEY = "safran-locale";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function readStoredLocale(storageKey: string, fallback: Locale): Locale {
  if (typeof window === "undefined") return fallback;
  const stored = window.localStorage.getItem(storageKey);
  if (stored === "en" || stored === "de") return stored;
  return fallback;
}

function writeLocaleCookie(storageKey: string, locale: Locale) {
  document.cookie = `${storageKey}=${locale}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
}

/**
 * Storefront and admin keep separate preferences: the public site defaults to
 * German, the back office to English.
 *
 * Pass `defaultLocale` from a cookie in the server layout so SSR matches the
 * client and Suspense/streaming cannot hydrate the wrong language.
 */
export function LocaleProvider({
  children,
  defaultLocale = "de",
  storageKey = DEFAULT_STORAGE_KEY,
}: {
  children: ReactNode;
  defaultLocale?: Locale;
  storageKey?: string;
}) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);

  useEffect(() => {
    // Hydration already finished with `defaultLocale`. Safe to adopt
    // localStorage if the cookie was missing on this first request.
    const stored = readStoredLocale(storageKey, defaultLocale);
    if (stored !== defaultLocale) {
      setLocaleState(stored);
      writeLocaleCookie(storageKey, stored);
      document.documentElement.lang = stored === "en" ? "en" : "de-CH";
      return;
    }
    window.localStorage.setItem(storageKey, defaultLocale);
    writeLocaleCookie(storageKey, defaultLocale);
    document.documentElement.lang = defaultLocale === "en" ? "en" : "de-CH";
  }, [defaultLocale, storageKey]);

  const setLocale = useCallback(
    (next: Locale) => {
      setLocaleState(next);
      window.localStorage.setItem(storageKey, next);
      writeLocaleCookie(storageKey, next);
      document.documentElement.lang = next === "en" ? "en" : "de-CH";
    },
    [storageKey],
  );

  const toggleLocale = useCallback(() => {
    setLocale(locale === "de" ? "en" : "de");
  }, [locale, setLocale]);

  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => {
      let text: string =
        messages[locale][key] ?? messages.de[key] ?? key;
      if (vars) {
        for (const [name, value] of Object.entries(vars)) {
          text = text.replaceAll(`{${name}}`, String(value));
        }
      }
      return text;
    },
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, toggleLocale, t }),
    [locale, setLocale, toggleLocale, t],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocale must be used within LocaleProvider");
  }
  return ctx;
}
