"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "@/lib/i18n/locale-context";
import type { MessageKey } from "@/lib/i18n/messages";

const navigation: Array<{ href: string; labelKey: MessageKey; icon: string }> = [
  {
    href: "/admin",
    labelKey: "admin.nav.overview",
    icon: "/images/home-1-svgrepo-com.svg",
  },
  {
    href: "/admin/orders",
    labelKey: "admin.nav.orders",
    icon: "/images/online-delivery-svgrepo-com.svg",
  },
  {
    href: "/admin/menu",
    labelKey: "admin.nav.menu",
    icon: "/images/menu-navigation-grid-1528-svgrepo-com.svg",
  },
  {
    href: "/admin/discounts",
    labelKey: "admin.nav.discounts",
    icon: "/images/percent-discount-svgrepo-com.svg",
  },
  {
    href: "/admin/delivery-zones",
    labelKey: "admin.nav.zones",
    icon: "/images/online-delivery-svgrepo-com.svg",
  },
  {
    href: "/admin/settings",
    labelKey: "admin.nav.settings",
    icon: "/images/setting-2-svgrepo-com.svg",
  },
];

export function AdminNav({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { t } = useLocale();

  return (
    <nav className="space-y-1 p-3" aria-label={t("admin.nav.label")}>
      {navigation.map((item) => {
        const active =
          item.href === "/admin"
            ? pathname === "/admin"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const label = t(item.labelKey);
        return (
          <Link
            key={item.href}
            href={item.href}
            title={label}
            onClick={onNavigate}
            className={`flex items-center rounded-xl text-sm transition ${
              collapsed ? "justify-center px-2 py-3" : "gap-3 px-3 py-3"
            } ${
              active
                ? "bg-white/12 text-white shadow-sm"
                : "text-cream/85 hover:bg-white/10 hover:text-white"
            }`}
          >
            <span
              aria-hidden
              className={`block shrink-0 bg-current ${
                active ? "opacity-100" : "opacity-70"
              }`}
              style={{
                width: 20,
                height: 20,
                WebkitMaskImage: `url(${item.icon})`,
                maskImage: `url(${item.icon})`,
                WebkitMaskSize: "contain",
                maskSize: "contain",
                WebkitMaskRepeat: "no-repeat",
                maskRepeat: "no-repeat",
                WebkitMaskPosition: "center",
                maskPosition: "center",
              }}
            />
            {!collapsed ? <span>{label}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
