import type { Metadata } from "next";
import { CheckoutForm } from "@/components/checkout-form";
import { CheckoutPageCopy } from "@/components/checkout-page-copy";
import { getStoreStatus } from "@/lib/store-status";
import {
  getCheckoutPricing,
  getStorefrontChrome,
} from "@/backend/services/storefront.service";

export const metadata: Metadata = {
  title: "Kasse",
  description:
    "Bestellen Sie indische Spezialitäten bei Safran Romanshorn zur Lieferung oder Abholung.",
};

export default async function KassePage() {
  const [chrome, pricing] = await Promise.all([
    getStorefrontChrome(),
    getCheckoutPricing(),
  ]);
  const status = getStoreStatus(chrome.statusConfig);

  return (
    <section className="bg-paper px-5 pt-32 pb-24 sm:px-8 sm:pt-36 sm:pb-32">
      <div className="mx-auto max-w-7xl">
        <CheckoutPageCopy />
        <CheckoutForm
          storeOpen={status.open}
          closedMessage={status.message}
          deliveryMinimum={pricing.deliveryMinimum}
          pickupMinimum={pricing.pickupMinimum}
          zoneMinimums={pricing.zoneMinimums}
        />
      </div>
    </section>
  );
}
