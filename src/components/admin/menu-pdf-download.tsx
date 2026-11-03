"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/lib/i18n/locale-context";

type MenuPdfDownloadProps = {
  /** Changes when menu catalog changes — drops stale browser PDF blobs. */
  revision: string;
};

export function MenuPdfDownload({ revision }: MenuPdfDownloadProps) {
  const { t } = useLocale();
  const [lang, setLang] = useState<"de" | "en">("de");
  const [pending, setPending] = useState<"preview" | "download" | null>(null);
  const [error, setError] = useState("");
  const blobCache = useRef(new Map<string, Blob>());

  useEffect(() => {
    blobCache.current.clear();
  }, [revision]);

  async function loadPdf(mode: "preview" | "download") {
    setPending(mode);
    setError("");
    const cacheKey = `${revision}:${lang}`;
    try {
      let blob = blobCache.current.get(cacheKey) ?? null;
      if (!blob) {
        const response = await fetch(`/api/admin/menu-pdf?lang=${lang}`);
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            message?: string;
          } | null;
          throw new Error(body?.message || t("admin.menu.pdfFailed"));
        }
        blob = await response.blob();
        blobCache.current.set(cacheKey, blob);
      }

      const url = URL.createObjectURL(blob);
      if (mode === "preview") {
        window.open(url, "_blank", "noopener,noreferrer");
      } else {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download =
          lang === "de" ? "safran-speisekarte-de.pdf" : "safran-menu-en.pdf";
        anchor.click();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.menu.pdfFailed"));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-sm font-semibold">
        {t("admin.menu.pdfLang")}
        <select
          className="mt-1 block min-w-40 rounded-xl border border-sage/25 bg-white px-3 py-2 text-sm"
          value={lang}
          onChange={(event) => {
            setLang(event.target.value as "de" | "en");
            setError("");
          }}
          disabled={pending !== null}
        >
          <option value="de">Deutsch</option>
          <option value="en">English</option>
        </select>
      </label>
      <button
        type="button"
        onClick={() => void loadPdf("preview")}
        disabled={pending !== null}
        className="inline-flex min-h-10 items-center justify-center rounded-xl border border-sage/30 bg-white px-4 py-2 text-sm font-semibold text-sage-deep disabled:opacity-60"
      >
        {pending === "preview"
          ? t("admin.menu.pdfPreviewing")
          : t("admin.menu.pdfPreview")}
      </button>
      <button
        type="button"
        onClick={() => void loadPdf("download")}
        disabled={pending !== null}
        className="inline-flex min-h-10 items-center justify-center rounded-xl bg-sage-deep px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending === "download"
          ? t("admin.menu.pdfBuilding")
          : t("admin.menu.pdfDownload")}
      </button>
      {error ? <p className="w-full text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
