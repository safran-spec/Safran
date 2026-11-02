import "server-only";

import { Resend } from "resend";
import {
  AUTO_COMPLETE_MINUTES,
  type OrderStatus,
} from "@/backend/domain/order-status";

export type EmailLocale = "de" | "en";

const STATUS_LABELS: Record<EmailLocale, Record<string, string>> = {
  de: {
    pending: "Neu",
    confirmed: "Bestätigt",
    preparing: "In Zubereitung",
    ready: "Bereit",
    out_for_delivery: "Unterwegs",
    completed: "Abgeschlossen",
    cancelled: "Storniert",
  },
  en: {
    pending: "New",
    confirmed: "Confirmed",
    preparing: "Being prepared",
    ready: "Ready",
    out_for_delivery: "On the way",
    completed: "Completed",
    cancelled: "Cancelled",
  },
};

/** Guests only ever see German or English; anything else means German. */
function emailLocale(value: string | null | undefined): EmailLocale {
  return value === "en" ? "en" : "de";
}

function siteUrl() {
  const explicit =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  }
  return "http://localhost:3000";
}

function fromAddress() {
  return (
    process.env.RESEND_FROM?.trim() ||
    "Safran Romanshorn <onboarding@resend.dev>"
  );
}

function getResend() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return null;
  return new Resend(apiKey);
}

function money(value: number, locale: EmailLocale) {
  return new Intl.NumberFormat(locale === "en" ? "en-CH" : "de-CH", {
    style: "currency",
    currency: "CHF",
  }).format(value);
}

function statusLabel(status: string, locale: EmailLocale) {
  return STATUS_LABELS[locale][status] ?? status;
}

function wrapHtml(title: string, body: string, locale: EmailLocale) {
  const contactLine =
    locale === "en"
      ? `If you have any questions, reach us on ${process.env.NEXT_PUBLIC_RESTAURANT_PHONE || "+41 71 244 55 33"} or ${process.env.NEXT_PUBLIC_RESTAURANT_EMAIL || "info@safran-solothurn.ch"}.`
      : `Bei Fragen erreichen Sie uns unter ${process.env.NEXT_PUBLIC_RESTAURANT_PHONE || "+41 71 244 55 33"} oder ${process.env.NEXT_PUBLIC_RESTAURANT_EMAIL || "info@safran-solothurn.ch"}.`;

  return `<!DOCTYPE html>
<html lang="${locale === "en" ? "en" : "de"}">
<head><meta charset="utf-8"/><title>${title}</title></head>
<body style="margin:0;background:#f6f3ee;font-family:Georgia,'Times New Roman',serif;color:#2f0d29;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f3ee;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;">
        <tr><td style="background:#2f0d29;padding:20px 24px;color:#f6f3ee;font-size:22px;">Safran Romanshorn</td></tr>
        <tr><td style="padding:28px 24px;font-size:16px;line-height:1.55;">${body}</td></tr>
        <tr><td style="padding:0 24px 28px;font-size:13px;color:#6b5b66;line-height:1.5;">
          ${contactLine}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export type OrderEmailContext = {
  to: string;
  customerName: string;
  orderNumber: string;
  confirmationToken: string;
  fulfillmentType: "delivery" | "pickup";
  total: number;
  status: string;
  /** Language the guest ordered in; defaults to German when unknown. */
  locale?: string | null;
  /** True after Stripe Checkout succeeds — email reads as a paid receipt. */
  paidOnline?: boolean;
};

export type KitchenOrderNotifyContext = {
  orderNumber: string;
  orderId?: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  fulfillmentType: "delivery" | "pickup";
  total: number;
  notes?: string | null;
  addressLine?: string | null;
  items: Array<{ name: string; quantity: number; unitPrice: number }>;
};

/** Comma-separated kitchen inbox(es) from env. Empty → skip notify. */
export function orderNotifyRecipients(): string[] {
  const raw = process.env.ORDER_NOTIFY_EMAIL?.trim() ?? "";
  if (!raw) return [];
  return raw
    .split(/[,;]+/)
    .map((email) => email.trim())
    .filter(Boolean);
}

async function sendEmail(input: {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
}) {
  const resend = getResend();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY missing — skipped:", input.subject);
    return { skipped: true as const };
  }

  const toList = Array.isArray(input.to) ? input.to : [input.to];
  const result = await resend.emails.send({
    from: fromAddress(),
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    replyTo:
      process.env.NEXT_PUBLIC_RESTAURANT_EMAIL?.trim() ||
      "info@safran-solothurn.ch",
  });

  if (result.error) {
    console.error("[email] Resend error:", {
      to: toList,
      subject: input.subject,
      error: result.error,
    });
    throw new Error(result.error.message || "email_failed");
  }

  console.info("[email] sent", {
    to: toList,
    subject: input.subject,
    id: result.data?.id,
  });

  return { skipped: false as const, id: result.data?.id };
}

/** Kitchen / owner alert when a guest places an order (German copy). */
export async function sendOrderNotifyEmail(ctx: KitchenOrderNotifyContext) {
  const recipients = orderNotifyRecipients();
  if (!recipients.length) {
    console.warn("[email] ORDER_NOTIFY_EMAIL missing — kitchen notify skipped");
    return { skipped: true as const };
  }

  const amount = money(ctx.total, "de");
  const fulfillment =
    ctx.fulfillmentType === "delivery" ? "Lieferung" : "Abholung";
  const waitMinutes = AUTO_COMPLETE_MINUTES[ctx.fulfillmentType];
  const waitLine =
    ctx.fulfillmentType === "delivery"
      ? `Erwartete Lieferzeit: ca. ${waitMinutes} Minuten`
      : `Erwartete Abholzeit: ca. ${waitMinutes} Minuten`;
  const adminUrl = ctx.orderId
    ? `${siteUrl()}/admin/orders/${ctx.orderId}`
    : `${siteUrl()}/admin/orders`;
  const itemLines = ctx.items.map(
    (item) =>
      `${item.quantity}× ${item.name} — ${money(item.quantity * item.unitPrice, "de")}`,
  );
  const subject = `Neue Bestellung #${ctx.orderNumber} (${fulfillment})`;

  const text = [
    `Neue Bestellung #${ctx.orderNumber}`,
    `Art: ${fulfillment}`,
    waitLine,
    `Total: ${amount}`,
    ``,
    `Kunde: ${ctx.customerName}`,
    `Telefon: ${ctx.customerPhone}`,
    `E-Mail: ${ctx.customerEmail}`,
    ctx.addressLine ? `Adresse: ${ctx.addressLine}` : null,
    ctx.notes ? `Notiz: ${ctx.notes}` : null,
    ``,
    `Positionen:`,
    ...itemLines,
    ``,
    `Admin: ${adminUrl}`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const htmlItems = itemLines
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("");

  const html = wrapHtml(
    subject,
    `
      <p><strong>Neue Bestellung #${escapeHtml(ctx.orderNumber)}</strong></p>
      <p>Art: ${escapeHtml(fulfillment)}<br/>${escapeHtml(waitLine)}<br/>Total: <strong>${escapeHtml(amount)}</strong></p>
      <p>
        Kunde: ${escapeHtml(ctx.customerName)}<br/>
        Telefon: ${escapeHtml(ctx.customerPhone)}<br/>
        E-Mail: ${escapeHtml(ctx.customerEmail)}
        ${ctx.addressLine ? `<br/>Adresse: ${escapeHtml(ctx.addressLine)}` : ""}
        ${ctx.notes ? `<br/>Notiz: ${escapeHtml(ctx.notes)}` : ""}
      </p>
      <p><strong>Positionen</strong></p>
      <ul>${htmlItems}</ul>
      <p style="margin:22px 0;">
        <a href="${escapeAttr(adminUrl)}" style="display:inline-block;background:#1a6b33;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-family:Arial,sans-serif;font-size:14px;font-weight:700;">
          Im Admin öffnen
        </a>
      </p>
    `,
    "de",
  );

  return sendEmail({
    to: recipients.length === 1 ? recipients[0]! : recipients,
    subject,
    html,
    text,
  });
}

function fulfillmentWaitCopy(
  fulfillmentType: "delivery" | "pickup",
  locale: EmailLocale,
) {
  const minutes = AUTO_COMPLETE_MINUTES[fulfillmentType];
  if (locale === "en") {
    return fulfillmentType === "delivery"
      ? `You will receive your order in about ${minutes} minutes.`
      : `Your order will be ready in about ${minutes} minutes. You can pick it up after ${minutes} minutes.`;
  }
  return fulfillmentType === "delivery"
    ? `Sie erhalten Ihre Bestellung in ca. ${minutes} Minuten.`
    : `Ihre Bestellung ist in ca. ${minutes} Minuten bereit. Sie können sie nach ${minutes} Minuten abholen.`;
}

export async function sendOrderPlacedEmail(ctx: OrderEmailContext) {
  const locale = emailLocale(ctx.locale);
  const trackUrl = `${siteUrl()}/bestellung/${ctx.confirmationToken}`;
  const amount = money(ctx.total, locale);
  const paid = ctx.paidOnline === true;
  const waitLine = fulfillmentWaitCopy(ctx.fulfillmentType, locale);
  const copy =
    locale === "en"
      ? {
          fulfillment: ctx.fulfillmentType === "delivery" ? "delivery" : "pickup",
          subject: paid
            ? `Receipt — order #${ctx.orderNumber} paid — Safran`
            : `Order #${ctx.orderNumber} received — Safran`,
          greeting: `Hello ${ctx.customerName},`,
          thanks: paid
            ? `thank you for your order #${ctx.orderNumber} (${ctx.fulfillmentType === "delivery" ? "delivery" : "pickup"}). Your online payment of ${amount} was received.`
            : `thank you for your order #${ctx.orderNumber} (${ctx.fulfillmentType === "delivery" ? "delivery" : "pickup"}).`,
          totalLabel: paid ? `Paid: ${amount}` : `Total: ${amount}`,
          waitLine,
          followLine: "You can follow the current status here at any time:",
          button: "Track order",
          fallbackLine: "If the button does not work:",
          saveLine:
            "Please save or bookmark this link, so you can find your order again after leaving the page.",
          signOff: "Kind regards",
        }
      : {
          fulfillment:
            ctx.fulfillmentType === "delivery" ? "Lieferung" : "Abholung",
          subject: paid
            ? `Quittung — Bestellung #${ctx.orderNumber} bezahlt — Safran`
            : `Bestellung #${ctx.orderNumber} erhalten — Safran`,
          greeting: `Hallo ${ctx.customerName},`,
          thanks: paid
            ? `vielen Dank für Ihre Bestellung #${ctx.orderNumber} (${ctx.fulfillmentType === "delivery" ? "Lieferung" : "Abholung"}). Ihre Online-Zahlung über ${amount} wurde erhalten.`
            : `vielen Dank für Ihre Bestellung #${ctx.orderNumber} (${ctx.fulfillmentType === "delivery" ? "Lieferung" : "Abholung"}).`,
          totalLabel: paid ? `Bezahlt: ${amount}` : `Total: ${amount}`,
          waitLine,
          followLine: "Den aktuellen Status können Sie jederzeit hier verfolgen:",
          button: "Bestellung verfolgen",
          fallbackLine: "Falls der Button nicht funktioniert:",
          saveLine:
            "Bitte speichern oder bookmarken Sie diesen Link — so finden Sie Ihre Bestellung auch wieder, wenn Sie die Seite verlassen.",
          signOff: "Freundliche Grüsse",
        };

  const text = [
    copy.greeting,
    ``,
    copy.thanks,
    copy.waitLine,
    copy.totalLabel,
    ``,
    copy.followLine,
    trackUrl,
    ``,
    copy.saveLine,
    ``,
    copy.signOff,
    `Safran Romanshorn`,
  ].join("\n");

  const html = wrapHtml(
    copy.subject,
    `
      <p>${escapeHtml(copy.greeting)}</p>
      <p>${escapeHtml(copy.thanks)}</p>
      <p><strong>${escapeHtml(copy.waitLine)}</strong></p>
      <p style="font-size:18px;margin:18px 0;"><strong>${escapeHtml(copy.totalLabel)}</strong></p>
      <p>${escapeHtml(copy.followLine)}</p>
      <p style="margin:22px 0;">
        <a href="${escapeAttr(trackUrl)}" style="display:inline-block;background:#1a6b33;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-family:Arial,sans-serif;font-size:14px;font-weight:700;">
          ${escapeHtml(copy.button)}
        </a>
      </p>
      <p style="font-size:13px;color:#6b5b66;">${escapeHtml(copy.fallbackLine)}<br/>
        <a href="${escapeAttr(trackUrl)}" style="color:#1a6b33;word-break:break-all;">${escapeHtml(trackUrl)}</a>
      </p>
      <p>${escapeHtml(copy.saveLine)}</p>
      <p>${escapeHtml(copy.signOff)}<br/>Safran Romanshorn</p>
    `,
    locale,
  );

  return sendEmail({ to: ctx.to, subject: copy.subject, html, text });
}

export async function sendOrderStatusEmail(
  ctx: OrderEmailContext & { status: OrderStatus | string },
) {
  const locale = emailLocale(ctx.locale);
  const trackUrl = `${siteUrl()}/bestellung/${ctx.confirmationToken}`;
  const label = statusLabel(ctx.status, locale);
  const copy =
    locale === "en"
      ? {
          subject: `Order #${ctx.orderNumber}: ${label} — Safran`,
          greeting: `Hello ${ctx.customerName},`,
          intro: `the status of your order #${ctx.orderNumber} has been updated:`,
          detailsLine: "Details and progress:",
          button: "View status",
          signOff: "Kind regards",
        }
      : {
          subject: `Bestellung #${ctx.orderNumber}: ${label} — Safran`,
          greeting: `Hallo ${ctx.customerName},`,
          intro: `der Status Ihrer Bestellung #${ctx.orderNumber} wurde aktualisiert:`,
          detailsLine: "Details und Fortschritt:",
          button: "Status ansehen",
          signOff: "Freundliche Grüsse",
        };

  const text = [
    copy.greeting,
    ``,
    copy.intro,
    label,
    ``,
    copy.detailsLine,
    trackUrl,
    ``,
    copy.signOff,
    `Safran Romanshorn`,
  ].join("\n");

  const html = wrapHtml(
    copy.subject,
    `
      <p>${escapeHtml(copy.greeting)}</p>
      <p>${escapeHtml(copy.intro)}</p>
      <p style="font-size:20px;margin:18px 0;"><strong>${escapeHtml(label)}</strong></p>
      <p style="margin:22px 0;">
        <a href="${escapeAttr(trackUrl)}" style="display:inline-block;background:#1a6b33;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-family:Arial,sans-serif;font-size:14px;font-weight:700;">
          ${escapeHtml(copy.button)}
        </a>
      </p>
      <p style="font-size:13px;color:#6b5b66;word-break:break-all;">
        <a href="${escapeAttr(trackUrl)}" style="color:#1a6b33;">${escapeHtml(trackUrl)}</a>
      </p>
      <p>${escapeHtml(copy.signOff)}<br/>Safran Romanshorn</p>
    `,
    locale,
  );

  return sendEmail({ to: ctx.to, subject: copy.subject, html, text });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value: string) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}
