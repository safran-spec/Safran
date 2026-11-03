import { NextResponse } from "next/server";
import { isAppError } from "@/backend/errors";
import { requireBackOffice } from "@/backend/auth/authorize";
import { confirmMfaCode } from "@/backend/services/auth.service";
import {
  buildMenuPdf,
  type MenuPdfLang,
} from "@/backend/services/menu-pdf.service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await requireBackOffice();
    const body = (await request.json().catch(() => null)) as {
      lang?: string;
      preview?: boolean;
      code?: string;
    } | null;
    await confirmMfaCode(typeof body?.code === "string" ? body.code : "");

    const preview = body?.preview === true;
    const lang: MenuPdfLang = body?.lang === "en" ? "en" : "de";
    const { bytes, filename } = await buildMenuPdf(lang);

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": preview
          ? `inline; filename="${filename}"`
          : `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (isAppError(error)) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.status },
      );
    }
    console.error("[menu-pdf]", error);
    const detail =
      error instanceof Error && error.message
        ? error.message
        : "PDF konnte nicht erstellt werden.";
    return NextResponse.json(
      { error: "pdf_failed", message: detail },
      { status: 500 },
    );
  }
}
