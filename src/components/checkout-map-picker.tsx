"use client";

import { useEffect, useId, useRef, useState } from "react";

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
/** Romanshorn harbour — default map center for Safran delivery area. */
const DEFAULT_CENTER: [number, number] = [47.5658, 9.3792];
const DEFAULT_ZOOM = 15;

export type MapAddressSuggestion = {
  id: string;
  label: string;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  lat: number;
  lon: number;
};

type LeafletMap = {
  setView: (center: [number, number], zoom: number) => LeafletMap;
  on: (event: string, handler: (e: { latlng: { lat: number; lng: number } }) => void) => void;
  off: (event?: string) => void;
  remove: () => void;
  invalidateSize: () => void;
};

type LeafletMarker = {
  setLatLng: (latlng: [number, number]) => LeafletMarker;
  addTo: (map: LeafletMap) => LeafletMarker;
  remove: () => void;
};

type LeafletNs = {
  map: (el: HTMLElement, opts?: { scrollWheelZoom?: boolean }) => LeafletMap;
  tileLayer: (
    url: string,
    opts: { attribution: string; maxZoom: number },
  ) => { addTo: (map: LeafletMap) => void };
  marker: (latlng: [number, number]) => LeafletMarker;
  Icon: {
    Default: {
      prototype: { _getIconUrl?: unknown };
      mergeOptions: (opts: Record<string, string>) => void;
    };
  };
};

declare global {
  interface Window {
    L?: LeafletNs;
  }
}

let leafletLoadPromise: Promise<LeafletNs> | null = null;

function loadLeaflet(): Promise<LeafletNs> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("no_window"));
  }
  if (window.L) return Promise.resolve(window.L);
  if (leafletLoadPromise) return leafletLoadPromise;

  leafletLoadPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${LEAFLET_JS}"]`,
    );
    if (existing) {
      existing.addEventListener("load", () => {
        if (window.L) resolve(window.L);
        else reject(new Error("leaflet_missing"));
      });
      existing.addEventListener("error", () => reject(new Error("leaflet_load")));
      if (window.L) resolve(window.L);
      return;
    }

    const script = document.createElement("script");
    script.src = LEAFLET_JS;
    script.async = true;
    script.onload = () => {
      if (window.L) resolve(window.L);
      else reject(new Error("leaflet_missing"));
    };
    script.onerror = () => reject(new Error("leaflet_load"));
    document.head.appendChild(script);
  });

  return leafletLoadPromise;
}

function fixDefaultIcons(L: LeafletNs) {
  // Point marker images at unpkg (CDN leaflet default paths break otherwise).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl:
      "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
}

export function CheckoutMapPicker({
  active,
  disabled,
  hint,
  searchPlaceholder,
  searchingLabel,
  emptyLabel,
  focus,
  onPick,
  onSelectAddress,
}: {
  active: boolean;
  disabled?: boolean;
  hint: string;
  searchPlaceholder: string;
  searchingLabel: string;
  emptyLabel: string;
  focus?: { lat: number; lon: number; key: number } | null;
  onPick: (lat: number, lon: number) => void;
  onSelectAddress: (suggestion: MapAddressSuggestion) => void;
}) {
  const listId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const leafletRef = useRef<LeafletNs | null>(null);
  const onPickRef = useRef(onPick);
  const onSelectRef = useRef(onSelectAddress);
  const disabledRef = useRef(disabled);
  const focusRef = useRef(focus);
  onPickRef.current = onPick;
  onSelectRef.current = onSelectAddress;
  disabledRef.current = disabled;
  focusRef.current = focus;

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<MapAddressSuggestion[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const searchSeq = useRef(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function placeFocus(L: LeafletNs, map: LeafletMap, point: [number, number]) {
    map.setView(point, 18);
    if (!markerRef.current) {
      markerRef.current = L.marker(point).addTo(map);
    } else {
      markerRef.current.setLatLng(point);
    }
  }

  useEffect(() => {
    if (!active) {
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current?.off();
      mapRef.current?.remove();
      mapRef.current = null;
      leafletRef.current = null;
      setQuery("");
      setSuggestions([]);
      setSearchOpen(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const L = await loadLeaflet();
        if (cancelled || !containerRef.current || mapRef.current) return;
        fixDefaultIcons(L);
        leafletRef.current = L;

        const initial = focusRef.current
          ? ([focusRef.current.lat, focusRef.current.lon] as [number, number])
          : DEFAULT_CENTER;
        const zoom = focusRef.current ? 18 : DEFAULT_ZOOM;

        const map = L.map(containerRef.current, {
          scrollWheelZoom: true,
        }).setView(initial, zoom);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(map);

        if (focusRef.current) {
          placeFocus(L, map, initial);
        }

        map.on("click", (event) => {
          if (disabledRef.current) return;
          const { lat, lng } = event.latlng;
          if (!markerRef.current) {
            markerRef.current = L.marker([lat, lng]).addTo(map);
          } else {
            markerRef.current.setLatLng([lat, lng]);
          }
          setSearchOpen(false);
          onPickRef.current(lat, lng);
        });

        mapRef.current = map;
        requestAnimationFrame(() => {
          map.invalidateSize();
          setTimeout(() => map.invalidateSize(), 120);
        });
      } catch (error) {
        console.error("[checkout-map]", error);
      }
    })();

    return () => {
      cancelled = true;
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current?.off();
      mapRef.current?.remove();
      mapRef.current = null;
      leafletRef.current = null;
    };
  }, [active]);

  useEffect(() => {
    if (!active || !focus || !mapRef.current || !leafletRef.current) return;
    placeFocus(leafletRef.current, mapRef.current, [focus.lat, focus.lon]);
  }, [active, focus]);

  useEffect(() => {
    if (!active) return;
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setSuggestions([]);
      setSearchLoading(false);
      setActiveIndex(-1);
      return;
    }

    const requestId = ++searchSeq.current;
    setSearchLoading(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(
            `/api/geo/search?q=${encodeURIComponent(trimmed)}`,
            { cache: "no-store" },
          );
          const data = (await response.json().catch(() => null)) as {
            ok?: boolean;
            suggestions?: MapAddressSuggestion[];
          } | null;
          if (requestId !== searchSeq.current) return;
          setSuggestions(
            response.ok && data?.ok ? (data.suggestions ?? []) : [],
          );
          setSearchOpen(true);
          setActiveIndex(-1);
        } catch {
          if (requestId !== searchSeq.current) return;
          setSuggestions([]);
        } finally {
          if (requestId === searchSeq.current) setSearchLoading(false);
        }
      })();
    }, 280);

    return () => clearTimeout(timer);
  }, [active, query]);

  useEffect(() => {
    return () => {
      if (blurTimer.current) clearTimeout(blurTimer.current);
    };
  }, []);

  function chooseSuggestion(suggestion: MapAddressSuggestion) {
    setQuery(suggestion.label);
    setSuggestions([]);
    setSearchOpen(false);
    setActiveIndex(-1);
    if (mapRef.current && leafletRef.current) {
      placeFocus(leafletRef.current, mapRef.current, [
        suggestion.lat,
        suggestion.lon,
      ]);
    }
    onSelectRef.current(suggestion);
  }

  if (!active) return null;

  return (
    <div className="sm:col-span-6">
      <div className="relative overflow-hidden rounded-2xl border border-ink/12">
        <div className="absolute inset-x-3 top-3 z-[500] pointer-events-none">
          <div className="pointer-events-auto relative">
            <input
              className="w-full rounded-xl border border-ink/15 bg-white/95 px-4 py-2.5 text-sm text-ink shadow-md outline-none backdrop-blur placeholder:text-muted/60 focus:border-sage focus:ring-2 focus:ring-sage/15"
              type="search"
              role="combobox"
              aria-expanded={searchOpen && suggestions.length > 0}
              aria-controls={listId}
              aria-autocomplete="list"
              autoComplete="off"
              spellCheck={false}
              placeholder={searchPlaceholder}
              value={query}
              disabled={disabled}
              onChange={(event) => {
                setQuery(event.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => {
                if (blurTimer.current) clearTimeout(blurTimer.current);
                if (suggestions.length) setSearchOpen(true);
              }}
              onBlur={() => {
                blurTimer.current = setTimeout(() => setSearchOpen(false), 150);
              }}
              onKeyDown={(event) => {
                if (!searchOpen || !suggestions.length) return;
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActiveIndex((i) => (i + 1) % suggestions.length);
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActiveIndex(
                    (i) => (i <= 0 ? suggestions.length : i) - 1,
                  );
                } else if (event.key === "Enter" && activeIndex >= 0) {
                  event.preventDefault();
                  const picked = suggestions[activeIndex];
                  if (picked) chooseSuggestion(picked);
                } else if (event.key === "Escape") {
                  setSearchOpen(false);
                }
              }}
            />
            {searchOpen && suggestions.length > 0 ? (
              <ul
                id={listId}
                role="listbox"
                className="mt-1 max-h-48 overflow-auto rounded-xl border border-ink/12 bg-white py-1 shadow-lg"
              >
                {suggestions.map((suggestion, index) => (
                  <li
                    key={suggestion.id}
                    role="option"
                    aria-selected={index === activeIndex}
                  >
                    <button
                      type="button"
                      className={`block w-full px-3 py-2 text-left text-sm transition ${
                        index === activeIndex
                          ? "bg-sage/15 text-ink"
                          : "text-ink hover:bg-cream"
                      }`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => chooseSuggestion(suggestion)}
                    >
                      {suggestion.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {searchOpen &&
            query.trim().length >= 3 &&
            !searchLoading &&
            suggestions.length === 0 ? (
              <p className="mt-1 rounded-xl border border-ink/10 bg-white px-3 py-2 text-xs text-muted shadow">
                {emptyLabel}
              </p>
            ) : null}
            {searchLoading ? (
              <p className="mt-1 rounded-xl border border-ink/10 bg-white px-3 py-2 text-xs text-muted shadow">
                {searchingLabel}
              </p>
            ) : null}
          </div>
        </div>
        <div
          ref={containerRef}
          className="z-0 h-72 w-full bg-cream/40"
          aria-label={hint}
        />
      </div>
      <p className="mt-2 text-xs text-muted">{hint}</p>
    </div>
  );
}
