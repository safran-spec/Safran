"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export type CheckoutConfirmDetails = {
  fulfillment: "delivery" | "pickup";
  paymentMethod: "cash" | "card";
  customerName: string;
  phone: string;
  email: string;
  street?: string;
  houseNumber?: string;
  postalCode?: string;
  city?: string;
  locationUrl?: string;
  totalLabel: string;
};

export function CheckoutConfirmDialog({
  details,
  title,
  body,
  addressTitle,
  fulfillmentLabel,
  paymentLabel,
  editLabel,
  confirmLabel,
  mapLinkLabel,
  onEdit,
  onConfirm,
}: {
  details: CheckoutConfirmDetails;
  title: string;
  body: string;
  addressTitle: string;
  fulfillmentLabel: string;
  paymentLabel: string;
  editLabel: string;
  confirmLabel: string;
  mapLinkLabel: string;
  onEdit: () => void;
  onConfirm: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onEdit();
    };
    window.addEventListener("keydown", onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [onEdit]);

  const addressLines =
    details.fulfillment === "delivery"
      ? [
          [details.street, details.houseNumber].filter(Boolean).join(" "),
          [details.postalCode, details.city].filter(Boolean).join(" "),
        ].filter(Boolean)
      : [];

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={editLabel}
        onClick={onEdit}
        className="absolute inset-0 bg-ink/50"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-confirm-title"
        className="relative w-full max-w-md rounded-3xl border border-ink/10 bg-white p-5 text-left shadow-xl sm:p-7"
      >
        <h2
          id="checkout-confirm-title"
          className="font-serif text-2xl text-ink"
        >
          {title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">{body}</p>

        <div className="mt-5 space-y-3 rounded-2xl bg-cream/60 p-4 text-sm text-ink">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-sage/15 px-3 py-1 text-xs font-semibold text-sage-deep">
              {fulfillmentLabel}
            </span>
            <span className="rounded-full bg-ink/5 px-3 py-1 text-xs font-semibold text-ink">
              {paymentLabel}
            </span>
          </div>

          <p>
            <span className="font-semibold">{details.customerName}</span>
            <br />
            {details.phone}
            <br />
            {details.email}
          </p>

          {details.fulfillment === "delivery" ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                {addressTitle}
              </p>
              <p className="mt-1 font-medium leading-6">
                {addressLines.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </p>
              {details.locationUrl ? (
                <a
                  href={details.locationUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-sm font-semibold text-sage-deep underline"
                >
                  {mapLinkLabel}
                </a>
              ) : null}
            </div>
          ) : null}

          <p className="border-t border-ink/10 pt-3 font-semibold">
            {details.totalLabel}
          </p>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-ink/15 bg-white px-5 py-2.5 text-sm font-semibold text-ink transition hover:border-sage hover:bg-cream"
          >
            {editLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-gold px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-gold-dark"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
