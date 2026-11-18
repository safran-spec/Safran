import { cookies } from "next/headers";
import { getStorefrontChrome } from "@/backend/services/storefront.service";
import { CartProvider } from "@/components/cart-provider";
import { LocaleProvider } from "@/lib/i18n/locale-context";
import { localeFromCookieValue } from "@/lib/i18n/locale";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default async function StorefrontLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [chrome, cookieStore] = await Promise.all([
    getStorefrontChrome(),
    cookies(),
  ]);
  const defaultLocale = localeFromCookieValue(
    cookieStore.get("safran-locale")?.value,
  );

  return (
    <LocaleProvider defaultLocale={defaultLocale}>
      <CartProvider>
        <div className="flex min-h-screen flex-col">
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter settings={chrome.settings} hours={chrome.hours} />
        </div>
      </CartProvider>
    </LocaleProvider>
  );
}
