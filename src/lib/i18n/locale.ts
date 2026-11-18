export type Locale = "de" | "en";

/** Safe to call from Server Components and Client Components. */
export function localeFromCookieValue(
  value: string | undefined | null,
): Locale {
  return value === "en" ? "en" : "de";
}
