import type { Metadata } from "next";
import { cookies } from "next/headers";
import { caveat } from "@/lib/fonts";
import { LocaleProvider } from "@/lib/i18n/locale-context";
import { localeFromCookieValue } from "@/lib/i18n/locale";

export const metadata: Metadata = {
  title: "Administration",
  robots: { index: false, follow: false },
};

export default async function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const stored = cookieStore.get("safran-admin-locale")?.value;
  const defaultLocale = stored
    ? localeFromCookieValue(stored)
    : "en";

  return (
    <LocaleProvider
      defaultLocale={defaultLocale}
      storageKey="safran-admin-locale"
    >
      <div className={caveat.variable}>{children}</div>
    </LocaleProvider>
  );
}
