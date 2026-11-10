import { NextResponse } from "next/server";

export const runtime = "nodejs";

const GEOADMIN_IDENTIFY =
  "https://api3.geo.admin.ch/rest/services/api/MapServer/identify";
/** Official Swiss building addresses (street + number + PLZ + city). */
const ADDRESS_LAYER = "ch.swisstopo.amtliches-gebaeudeadressverzeichnis";
/** Fallback: locality PLZ only. */
const PLZ_LAYER = "ch.swisstopo-vd.ortschaftenverzeichnis_plz";

type AddrProps = {
  stn_label?: string;
  adr_number?: string | number;
  zip_label?: string;
  com_name?: string;
  plz?: number | string;
  langtext?: string;
  label?: number | string;
};

type GeoJsonPoint = {
  type?: string;
  coordinates?: number[];
};

type IdentifyFeature = {
  attributes?: AddrProps;
  properties?: AddrProps;
  geometry?: GeoJsonPoint;
};

type GeoAdminIdentifyResponse = {
  results?: IdentifyFeature[];
};

function parseCoord(value: string | null, min: number, max: number) {
  if (value == null || value.trim() === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

function propsOf(feature: IdentifyFeature | undefined): AddrProps {
  return feature?.properties ?? feature?.attributes ?? {};
}

function dist2(lon: number, lat: number, x: number, y: number) {
  const dx = lon - x;
  const dy = lat - y;
  return dx * dx + dy * dy;
}

function nearestFeature(
  results: IdentifyFeature[] | undefined,
  lon: number,
  lat: number,
): IdentifyFeature | undefined {
  if (!results?.length) return undefined;
  let best: IdentifyFeature | undefined;
  let bestD = Infinity;
  for (const feature of results) {
    const coords = feature.geometry?.coordinates;
    if (!coords || coords.length < 2) continue;
    const d = dist2(lon, lat, coords[0], coords[1]);
    if (d < bestD) {
      bestD = d;
      best = feature;
    }
  }
  return best ?? results[0];
}

function fourDigitPlz(raw: unknown): string {
  return String(raw ?? "")
    .replace(/\D/g, "")
    .slice(0, 4);
}

async function identify(
  lon: number,
  lat: number,
  layer: string,
  options: { returnGeometry: boolean; tolerance: number; pad: number },
): Promise<GeoAdminIdentifyResponse> {
  const mapExtent = [
    lon - options.pad,
    lat - options.pad,
    lon + options.pad,
    lat + options.pad,
  ].join(",");

  const identifyUrl = new URL(GEOADMIN_IDENTIFY);
  identifyUrl.searchParams.set("geometryType", "esriGeometryPoint");
  identifyUrl.searchParams.set("geometry", `${lon},${lat}`);
  identifyUrl.searchParams.set("sr", "4326");
  identifyUrl.searchParams.set("tolerance", String(options.tolerance));
  identifyUrl.searchParams.set("imageDisplay", "100,100,96");
  identifyUrl.searchParams.set("mapExtent", mapExtent);
  identifyUrl.searchParams.set("layers", `all:${layer}`);
  identifyUrl.searchParams.set(
    "returnGeometry",
    options.returnGeometry ? "true" : "false",
  );
  if (options.returnGeometry) {
    identifyUrl.searchParams.set("geometryFormat", "geojson");
  }
  identifyUrl.searchParams.set("lang", "de");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const upstream = await fetch(identifyUrl.toString(), {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!upstream.ok) {
      throw new Error(`upstream_${upstream.status}`);
    }
    return (await upstream.json()) as GeoAdminIdentifyResponse;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Reverse-geocode Swiss lat/lon → street, house number, PLZ, city
 * via free swisstopo GeoAdmin. Manual address entry stays available.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const lat = parseCoord(url.searchParams.get("lat"), 45.5, 48);
    const lon = parseCoord(url.searchParams.get("lon"), 5.5, 11);

    if (lat == null || lon == null) {
      return NextResponse.json(
        { ok: false, message: "invalid_coords" },
        { status: 400 },
      );
    }

    let street: string | null = null;
    let houseNumber: string | null = null;
    let postalCode = "";
    let city: string | null = null;

    try {
      // Tight map window so GeoAdmin’s capped result set stays near the point.
      const addressData = await identify(lon, lat, ADDRESS_LAYER, {
        returnGeometry: true,
        tolerance: 40,
        pad: 0.003,
      });
      const nearest = nearestFeature(addressData.results, lon, lat);
      const a = propsOf(nearest);
      const streetName =
        typeof a.stn_label === "string" ? a.stn_label.trim() : "";
      const number =
        a.adr_number != null ? String(a.adr_number).trim() : "";
      postalCode = fourDigitPlz(a.zip_label);
      city = typeof a.com_name === "string" ? a.com_name.trim() : null;
      if (streetName) street = streetName;
      if (number) houseNumber = number;
    } catch (error) {
      console.warn("[geo/postal] address layer failed, trying PLZ", error);
    }

    if (!/^\d{4}$/.test(postalCode)) {
      const plzData = await identify(lon, lat, PLZ_LAYER, {
        returnGeometry: false,
        tolerance: 10,
        pad: 0.01,
      });
      const a = propsOf(plzData.results?.[0]);
      postalCode = fourDigitPlz(a.plz ?? a.label);
      if (!city && typeof a.langtext === "string") {
        city = a.langtext.trim() || null;
      }
    }

    if (!/^\d{4}$/.test(postalCode)) {
      return NextResponse.json(
        { ok: false, message: "not_found" },
        { status: 404 },
      );
    }

    const formatted = [street, houseNumber, postalCode, city]
      .filter(Boolean)
      .join(", ")
      .replace(/^,\s*|,\s*$/g, "")
      .replace(/,\s*,/g, ",");

    return NextResponse.json(
      {
        ok: true,
        street,
        houseNumber,
        postalCode,
        city,
        formattedAddress: formatted || null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[geo/postal]", error);
    return NextResponse.json(
      { ok: false, message: "lookup_failed" },
      { status: 503 },
    );
  }
}
