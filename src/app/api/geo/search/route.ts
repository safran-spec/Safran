import { NextResponse } from "next/server";

export const runtime = "nodejs";

const GEOADMIN_SEARCH =
  "https://api3.geo.admin.ch/rest/services/api/SearchServer";

type SearchAttrs = {
  label?: string;
  detail?: string;
  lat?: number;
  lon?: number;
  x?: number;
  y?: number;
  num?: number | string;
  origin?: string;
};

type SearchHit = {
  id?: number | string;
  attrs?: SearchAttrs;
};

type SearchResponse = {
  results?: SearchHit[];
};

export type GeoSearchSuggestion = {
  id: string;
  label: string;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  lat: number;
  lon: number;
};

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function parseHit(hit: SearchHit, index: number): GeoSearchSuggestion | null {
  const attrs = hit.attrs;
  if (!attrs) return null;

  const lat = Number(attrs.lat ?? attrs.y);
  const lon = Number(attrs.lon ?? attrs.x);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const plain = stripHtml(String(attrs.label ?? ""));
  if (!plain) return null;

  // "Im Bahnhof 5 8590 Romanshorn" or "Pestalozzistrasse # 8590 Romanshorn"
  const match = plain.match(
    /^(.*?)(?:\s+(#|\d+[a-zA-Z]?))?\s+(\d{4})\s+(.+)$/,
  );
  const street = (match?.[1] ?? "").trim();
  const houseFromLabel =
    match?.[2] && match[2] !== "#" ? String(match[2]).trim() : "";
  const num = Number(attrs.num);
  const houseNumber =
    Number.isFinite(num) && num > 0 ? String(num) : houseFromLabel;
  const postalCode = match?.[3] ?? "";
  const city = (match?.[4] ?? "").trim();

  if (!street || !/^\d{4}$/.test(postalCode)) return null;

  return {
    id: String(hit.id ?? `${index}-${postalCode}-${street}`),
    label: plain,
    street,
    houseNumber,
    postalCode,
    city,
    lat,
    lon,
  };
}

/**
 * Swiss address autocomplete via free GeoAdmin SearchServer.
 * Used by checkout search-and-select.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    if (q.length < 3) {
      return NextResponse.json(
        { ok: true, suggestions: [] as GeoSearchSuggestion[] },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (q.length > 80) {
      return NextResponse.json(
        { ok: false, message: "query_too_long" },
        { status: 400 },
      );
    }

    const searchUrl = new URL(GEOADMIN_SEARCH);
    searchUrl.searchParams.set("searchText", q);
    searchUrl.searchParams.set("type", "locations");
    searchUrl.searchParams.set("origins", "address");
    searchUrl.searchParams.set("limit", "8");
    searchUrl.searchParams.set("sr", "4326");
    searchUrl.searchParams.set("lang", "de");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    let upstream: Response;
    try {
      upstream = await fetch(searchUrl.toString(), {
        signal: controller.signal,
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
    } finally {
      clearTimeout(timer);
    }

    if (!upstream.ok) {
      return NextResponse.json(
        { ok: false, message: "upstream_error" },
        { status: 502 },
      );
    }

    const data = (await upstream.json()) as SearchResponse;
    const suggestions = (data.results ?? [])
      .map((hit, index) => parseHit(hit, index))
      .filter((item): item is GeoSearchSuggestion => item != null);

    return NextResponse.json(
      { ok: true, suggestions },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[geo/search]", error);
    return NextResponse.json(
      { ok: false, message: "lookup_failed" },
      { status: 503 },
    );
  }
}
