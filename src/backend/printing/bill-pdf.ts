import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PDFDocument, PDFFont } from "pdf-lib";
import {
  kitchenFulfillmentLabel,
  kitchenPaymentLabel,
} from "@/backend/printing/bill-labels";

/** Shared bill content for Brother A4 PDF printing. */

export type ReceiptLine = {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  notes?: string | null;
};

export type ReceiptPayload = {
  restaurantName: string;
  orderNumber: string;
  createdAt: string;
  fulfillmentType: "pickup" | "delivery";
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  customerNotes?: string | null;
  address?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  postalCode?: string | null;
  city?: string | null;
  items: ReceiptLine[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  currency: string;
  paymentMethod: string;
  /** `pending` | `paid` | … — used with paymentMethod for kitchen labels. */
  paymentStatus?: string | null;
};

export function receiptPayloadFromJson(value: unknown): ReceiptPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.orderNumber !== "string" || !Array.isArray(row.items)) {
    return null;
  }
  return value as ReceiptPayload;
}

function money(amount: number, currency: string) {
  return `${currency} ${amount.toFixed(2)}`;
}

const isLink = (value: string) => /^https?:\/\//i.test(value);

/** Splits a joined address into lines, dropping map links — useless on paper. */
function addressParts(value: string) {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part && !isLink(part));
}

/** Standard PDF fonts only support WinAnsi — map common DE/CH characters. */
function pdfSafe(text: string) {
  return text
    .replaceAll("×", "x")
    .replaceAll("–", "-")
    .replaceAll("—", "-")
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("Ä", "Ae")
    .replaceAll("Ö", "Oe")
    .replaceAll("Ü", "Ue")
    .replaceAll("ß", "ss")
    .replaceAll("€", "EUR")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const CONTENT_TOP = 790;
/** Content stops here so nothing collides with the page footer. */
const CONTENT_BOTTOM = 72;

/**
 * Caveat — the same handwriting the admin header uses for "Safran". Shipped in
 * the repo because the bill is built on the server, where Google's webfont CSS
 * is not available; `outputFileTracingIncludes` keeps it in the deployment.
 */
const HANDWRITING_PATH = path.join(
  process.cwd(),
  "src",
  "backend",
  "printing",
  "fonts",
  "Caveat-Regular.ttf",
);

let handwritingBytes: Buffer | null | undefined;

async function loadHandwritingBytes() {
  if (handwritingBytes === undefined) {
    try {
      handwritingBytes = await readFile(HANDWRITING_PATH);
    } catch (error) {
      console.error(
        "[print] handwriting font unavailable, falling back to Helvetica",
        error instanceof Error ? error.message : error,
      );
      handwritingBytes = null;
    }
  }
  return handwritingBytes;
}

/** Never let a missing or broken font stop a kitchen ticket from printing. */
async function embedHandwriting(doc: PDFDocument): Promise<PDFFont | null> {
  const bytes = await loadHandwritingBytes();
  if (!bytes) return null;
  try {
    const fontkit = (await import("@pdf-lib/fontkit")).default;
    doc.registerFontkit(fontkit);
    return await doc.embedFont(bytes, { subset: true });
  } catch (error) {
    console.error(
      "[print] handwriting font could not be embedded",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/**
 * Builds an A4 kitchen/counter bill PDF for Brother laser printers. Large
 * orders continue on further sheets: every item is printed, and the totals
 * always land on the last page.
 */
export async function buildBillPdf(payload: ReceiptPayload): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const script = await embedHandwriting(doc);

  const pageWidth = PAGE_WIDTH;
  const left = 48;
  const right = 547;
  let y = CONTENT_TOP;
  const ink = rgb(0.1, 0.1, 0.1);
  const muted = rgb(0.35, 0.35, 0.35);

  type TextStyle = {
    bold?: boolean;
    script?: boolean;
    color?: ReturnType<typeof rgb>;
  };

  const pickFont = (style?: TextStyle) =>
    style?.script && script ? script : style?.bold ? bold : font;

  /** Trims to `maxWidth` so a long address can never run into the next column. */
  const fit = (text: string, size: number, style: TextStyle, maxWidth: number) => {
    const used = pickFont(style);
    let safe = pdfSafe(text);
    if (used.widthOfTextAtSize(safe, size) <= maxWidth) return safe;
    while (safe.length > 1 && used.widthOfTextAtSize(`${safe}...`, size) > maxWidth) {
      safe = safe.slice(0, -1);
    }
    return `${safe}...`;
  };

  /** Absolute placement, used by the two header columns with their own cursors. */
  const draw = (
    text: string,
    size: number,
    position: { x: number; y: number; align?: "left" | "right" | "center" },
    style?: TextStyle,
  ) => {
    const used = pickFont(style);
    const safe = pdfSafe(text);
    const width = used.widthOfTextAtSize(safe, size);
    const x =
      position.align === "right"
        ? position.x - width
        : position.align === "center"
          ? position.x - width / 2
          : position.x;
    page.drawText(safe, {
      x,
      y: position.y,
      size,
      font: used,
      color: style?.color ?? ink,
    });
  };

  const write = (
    text: string,
    size: number,
    options?: TextStyle & { x?: number },
  ) => {
    draw(text, size, { x: options?.x ?? left, y }, options);
  };

  const writeCentered = (text: string, size: number, options?: TextStyle) => {
    draw(text, size, { x: pageWidth / 2, y, align: "center" }, options);
  };

  const divider = () => {
    page.drawLine({
      start: { x: left, y },
      end: { x: right, y },
      thickness: 1,
      color: rgb(0.75, 0.75, 0.75),
    });
  };

  // Top banner: fulfillment + payment — large for kitchen sorting.
  const fulfillmentLabel = kitchenFulfillmentLabel(payload.fulfillmentType);
  const paymentLabel = kitchenPaymentLabel(
    payload.paymentMethod,
    payload.paymentStatus,
  );
  const bannerLabel = `${fulfillmentLabel} · ${paymentLabel}`;

  /**
   * Continues the ticket on a fresh sheet. The short header repeats the order
   * number and type so a loose second page can still be matched to its order.
   */
  const continueOnNextPage = () => {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = CONTENT_TOP;
    write(`#${payload.orderNumber} — ${bannerLabel} (continued)`, 13, {
      bold: true,
    });
    y -= 20;
    divider();
    y -= 22;
  };

  /** Starts a new page when the next block would not fit above the footer. */
  const reserve = (height: number) => {
    if (y - height < CONTENT_BOTTOM) continueOnNextPage();
  };

  // Letterhead row: handwritten wordmark in the corner, type + payment big
  // and centered so the kitchen can sort tickets at a glance.
  draw(payload.restaurantName, 30, { x: left, y: y - 4 }, { script: true });
  writeCentered(bannerLabel, 24, { bold: true });
  y -= 40;

  // Header row: the guest on the left, the shop and order reference on the
  // right. Both columns run on their own cursor, and the ticket continues below
  // the deeper of the two.
  const columnTop = y;
  const leftWidth = 240;
  const rightWidth = 210;

  let leftY = columnTop;
  const leftLine = (
    text: string,
    size: number,
    style: TextStyle,
    gap: number,
  ) => {
    draw(fit(text, size, style, leftWidth), size, { x: left, y: leftY }, style);
    leftY -= gap;
  };

  leftLine("CUSTOMER", 9, { bold: true, color: muted }, 16);
  leftLine(payload.customerName, 12, { bold: true }, 15);
  leftLine(payload.customerPhone, 11, {}, 14);
  if (payload.customerEmail) {
    leftLine(payload.customerEmail, 9.5, { color: muted }, 14);
  }

  if (payload.fulfillmentType === "delivery") {
    const line2 = payload.addressLine2?.trim();
    const structured = [
      payload.addressLine1?.trim(),
      line2 && !isLink(line2) ? line2 : "",
      [payload.postalCode, payload.city].filter(Boolean).join(" ").trim(),
    ].filter((part): part is string => Boolean(part));

    // `address` is a pre-joined fallback; prefer it when it carries more detail
    // than the individual columns, which are not always filled in.
    const flat = payload.address ? addressParts(payload.address) : [];
    const lines = (structured.length >= flat.length ? structured : flat).filter(
      // A maps link is unusable on paper — the driver needs the street.
      (line) => !isLink(line),
    );

    leftY -= 6;
    leftLine("DELIVER TO", 9, { bold: true, color: muted }, 15);
    if (lines.length) {
      for (const line of lines) leftLine(line, 11, {}, 14);
    } else {
      leftLine("No address provided", 11, { color: muted }, 14);
    }
  } else {
    leftY -= 6;
    leftLine("COLLECTS AT THE COUNTER", 9, { bold: true, color: muted }, 15);
  }

  let rightY = columnTop;
  const rightLine = (
    text: string,
    size: number,
    style: TextStyle,
    gap: number,
  ) => {
    draw(
      fit(text, size, style, rightWidth),
      size,
      { x: right, y: rightY, align: "right" },
      style,
    );
    rightY -= gap;
  };

  rightLine("Order / Kitchen ticket", 10, { color: muted }, 20);
  rightLine(`#${payload.orderNumber}`, 17, { bold: true }, 17);
  rightLine(payload.createdAt, 10, { color: muted }, 0);

  y = Math.min(leftY, rightY) - 20;
  divider();
  y -= 22;

  // Numbered lines so staff can call out "number 4 is missing" while packing,
  // and so a continued list stays countable across sheets.
  const numberColumn = left + 26;
  payload.items.forEach((item, index) => {
    reserve(item.notes ? 34 : 20);
    draw(`${index + 1}.`, 10, { x: left, y }, { color: muted });
    draw(`${item.quantity}×  ${item.name}`.slice(0, 55), 11, {
      x: numberColumn,
      y,
    }, { bold: true });
    draw(
      money(item.lineTotal, payload.currency),
      11,
      { x: right, y, align: "right" },
      { bold: true },
    );
    y -= 16;
    if (item.notes) {
      draw(item.notes.slice(0, 70), 9, { x: numberColumn, y }, { color: muted });
      y -= 14;
    }
    y -= 4;
  });

  // Keep the whole totals block together: a TOTAL split from its subtotal, or
  // pushed onto a page of its own, is what the counter double-checks.
  reserve(28 + (payload.deliveryFee > 0 ? 16 : 0) + 54);
  y -= 8;
  divider();
  y -= 20;
  write(`Subtotal: ${money(payload.subtotal, payload.currency)}`, 11);
  y -= 16;
  if (payload.deliveryFee > 0) {
    write(`Delivery fee: ${money(payload.deliveryFee, payload.currency)}`, 11);
    y -= 16;
  }
  write(`TOTAL: ${money(payload.total, payload.currency)}`, 14, { bold: true });
  y -= 18;
  write(`Type: ${fulfillmentLabel}`, 12, { bold: true });
  y -= 16;
  write(`Payment: ${paymentLabel}`, 14, { bold: true });
  y -= 22;

  if (payload.customerNotes) {
    reserve(58);
    divider();
    y -= 22;
    write("NOTE", 12, { bold: true });
    y -= 18;
    write(payload.customerNotes.slice(0, 90), 11);
  }

  // Only stamp sheet numbers when the ticket actually runs over, so a normal
  // one-page bill looks exactly as before.
  const pages = doc.getPages();
  if (pages.length > 1) {
    pages.forEach((sheet, index) => {
      const label = `#${payload.orderNumber}  ·  Page ${index + 1} of ${pages.length}`;
      const safe = pdfSafe(label);
      sheet.drawText(safe, {
        x: (PAGE_WIDTH - font.widthOfTextAtSize(safe, 9)) / 2,
        y: 40,
        size: 9,
        font,
        color: muted,
      });
    });
  }

  return doc.save();
}
