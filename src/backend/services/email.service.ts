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
  /** cash = COD / Bar; card = online (Stripe). */
  paymentMethod?: "cash" | "card";
  /** True when Stripe payment already succeeded. */
  paidOnline?: boolean;
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

function kitchenPaymentLabel(ctx: KitchenOrderNotifyContext): string {
  if (ctx.paidOnline || ctx.paymentMethod === "card") {
    return ctx.paidOnline ? "PAID (Online)" : "ONLINE (Card/TWINT)";
  }
  // Pickup is not "cash on delivery" — show unpaid / pay at restaurant.
  if (ctx.fulfillmentType === "pickup") {
    return "UNPAID (Pay on pickup)";
  }
  return "COD (Cash on delivery)";
}

function kitchenFulfillmentLabel(
  fulfillmentType: "delivery" | "pickup",
): string {
  return fulfillmentType === "delivery" ? "DELIVERY" : "PICKUP";
}

/** Kitchen / owner alert when a guest places an order (always English). */
export async function sendOrderNotifyEmail(ctx: KitchenOrderNotifyContext) {
  const recipients = orderNotifyRecipients();
  if (!recipients.length) {
    console.warn("[email] ORDER_NOTIFY_EMAIL missing — kitchen notify skipped");
    return { skipped: true as const };
  }

  const amount = money(ctx.total, "en");
  const fulfillment = kitchenFulfillmentLabel(ctx.fulfillmentType);
  const payment = kitchenPaymentLabel(ctx);
  const waitMinutes = AUTO_COMPLETE_MINUTES[ctx.fulfillmentType];
  const waitLine =
    ctx.fulfillmentType === "delivery"
      ? `Expected delivery time: about ${waitMinutes} minutes`
      : `Expected pickup time: about ${waitMinutes} minutes`;
  const adminUrl = ctx.orderId
    ? `${siteUrl()}/admin/orders/${ctx.orderId}`
    : `${siteUrl()}/admin/orders`;
  const itemLines = ctx.items.map(
    (item) =>
      `${item.quantity}× ${item.name} — ${money(item.quantity * item.unitPrice, "en")}`,
  );
  const subject = `New order #${ctx.orderNumber} — ${fulfillment} · ${payment}`;

  const text = [
    `New order #${ctx.orderNumber}`,
    `Payment: ${payment}`,
    `Type: ${fulfillment}`,
    waitLine,
    `Total: ${amount}`,
    ``,
    `Customer: ${ctx.customerName}`,
    `Phone: ${ctx.customerPhone}`,
    `Email: ${ctx.customerEmail}`,
    ctx.addressLine ? `Address: ${ctx.addressLine}` : null,
    ctx.notes ? `Notes: ${ctx.notes}` : null,
    ``,
    `Items:`,
    ...itemLines,
    ``,
    `Admin: ${adminUrl}`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const htmlItems = itemLines
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("");

  const paymentBg = ctx.paidOnline || ctx.paymentMethod === "card"
    ? "#1a6b33"
    : "#8a5a00";

  const html = wrapHtml(
    subject,
    `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 18px;border-collapse:collapse;">
        <tr>
          <td style="background:${paymentBg};color:#fff;padding:14px 16px;border-radius:12px;font-family:Arial,sans-serif;">
            <div style="font-size:12px;letter-spacing:0.04em;text-transform:uppercase;opacity:0.9;">New order #${escapeHtml(ctx.orderNumber)}</div>
            <div style="margin-top:8px;font-size:20px;font-weight:800;line-height:1.25;">
              ${escapeHtml(payment)}
              <span style="opacity:0.75;font-weight:600;"> · </span>
              ${escapeHtml(fulfillment)}
            </div>
            <div style="margin-top:8px;font-size:14px;">Total: <strong>${escapeHtml(amount)}</strong></div>
          </td>
        </tr>
      </table>
      <p>${escapeHtml(waitLine)}</p>
      <p>
        Customer: ${escapeHtml(ctx.customerName)}<br/>
        Phone: ${escapeHtml(ctx.customerPhone)}<br/>
        Email: ${escapeHtml(ctx.customerEmail)}
        ${ctx.addressLine ? `<br/>Address: ${escapeHtml(ctx.addressLine)}` : ""}
        ${ctx.notes ? `<br/>Notes: ${escapeHtml(ctx.notes)}` : ""}
      </p>
      <p><strong>Items</strong></p>
      <ul>${htmlItems}</ul>
      <p style="margin:22px 0;">
        <a href="${escapeAttr(adminUrl)}" style="display:inline-block;background:#1a6b33;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-family:Arial,sans-serif;font-size:14px;font-weight:700;">
          Open in admin
        </a>
      </p>
    `,
    "en",
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
  // Guest emails are always Swiss German (de-CH), even if the site UI was English.
  void ctx.locale;
  const locale: EmailLocale = "de";
  const trackUrl = `${siteUrl()}/bestellung/${ctx.confirmationToken}`;
  const amount = money(ctx.total, locale);
  const paid = ctx.paidOnline === true;
  const waitLine = fulfillmentWaitCopy(ctx.fulfillmentType, locale);
  const copy = {
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
  // Guest status emails stay Swiss German regardless of UI locale.
  void ctx.locale;
  const locale: EmailLocale = "de";
  const trackUrl = `${siteUrl()}/bestellung/${ctx.confirmationToken}`;
  const label = statusLabel(ctx.status, locale);
  const copy = {
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
