"use client";

import { useEffect, useRef, useState } from "react";
import type { LayerGroup, Map as LeafletMap, Marker } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Point } from "@/lib/placeKey";
import type { TimetableItem } from "@/lib/timetable";

export interface PinGroup {
  key: string;
  point: Point;
  items: TimetableItem[];
}

// UCL's main quad: where the map starts when nothing is pinned yet.
const UCL: [number, number] = [51.5246, -0.134];

const TILES = {
  light: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
};
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

const isDark = () =>
  document.documentElement.dataset.theme === "dark" ||
  (document.documentElement.dataset.theme !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const time = new Intl.DateTimeFormat("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

function popupHtml(group: PinGroup): string {
  const rows = group.items
    .slice(0, 8)
    .map(
      (i) =>
        `<li><a href="${escape(i.href)}"${i.external ? ' target="_blank" rel="noreferrer"' : ""}>${escape(i.title)}</a>` +
        `<span>${escape(i.allDay ? "All day" : time.format(new Date(i.startsAt)))} · ${escape(i.host)}</span></li>`,
    )
    .join("");
  const more = group.items.length > 8 ? `<p>and ${group.items.length - 8} more</p>` : "";
  return `<div class="tt-popup"><strong>${escape(group.items[0].location ?? "")}</strong><ul>${rows}</ul>${more}</div>`;
}

/**
 * The week's places on a map. One pin per spot, numbered when several things
 * happen there; the selected item's pin is highlighted and opened. Leaflet
 * touches `window`, so it is loaded inside the effect, never on the server.
 */
export function TimetableMap({
  groups,
  selectedId,
  onSelect,
}: {
  groups: PinGroup[];
  selectedId: string | null;
  onSelect: (itemId: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const markers = useRef(new Map<string, Marker>());
  const lib = useRef<typeof import("leaflet") | null>(null);
  const fitted = useRef("");
  const [ready, setReady] = useState(false);
  // The latest callback, so redrawing pins doesn't depend on its identity.
  const select = useRef(onSelect);
  useEffect(() => {
    select.current = onSelect;
  });

  // The map itself, once.
  useEffect(() => {
    let cancelled = false;
    let observer: MutationObserver | null = null;
    void import("leaflet").then((L) => {
      if (cancelled || !box.current) return;
      lib.current = L;
      const m = L.map(box.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false }).setView(UCL, 13);
      let tiles = L.tileLayer(isDark() ? TILES.dark : TILES.light, { attribution: ATTRIBUTION, maxZoom: 19, subdomains: "abcd" }).addTo(m);
      // Follow the site's light/dark switch.
      observer = new MutationObserver(() => {
        const url = isDark() ? TILES.dark : TILES.light;
        if ((tiles as unknown as { _url: string })._url === url) return;
        tiles.remove();
        tiles = L.tileLayer(url, { attribution: ATTRIBUTION, maxZoom: 19, subdomains: "abcd" }).addTo(m);
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      layer.current = L.layerGroup().addTo(m);
      map.current = m;
      // Leaflet measures its box once; a sticky sidebar settles after first paint.
      requestAnimationFrame(() => m.invalidateSize());
      setReady(true);
    });
    return () => {
      cancelled = true;
      observer?.disconnect();
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // The pins, whenever the week or the filters change.
  useEffect(() => {
    const L = lib.current;
    const m = map.current;
    if (!ready || !L || !m || !layer.current) return;
    layer.current.clearLayers();
    markers.current.clear();
    for (const group of groups) {
      const count = group.items.length;
      const icon = L.divIcon({
        className: "tt-pin-wrap",
        html: `<span class="tt-pin${group.items.some((i) => i.kind === "session") ? " tt-pin-session" : ""}">${count > 1 ? count : ""}</span>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });
      const marker = L.marker([group.point.lat, group.point.lng], { icon, title: group.items[0].location ?? "" })
        .bindPopup(popupHtml(group), { maxWidth: 280 })
        .on("click", () => select.current(group.items[0].id));
      marker.addTo(layer.current);
      for (const item of group.items) markers.current.set(item.id, marker);
    }
    // Fit to the pins when the set of places changes, not on every filter tweak within it.
    const signature = groups.map((g) => g.key).join("|");
    if (groups.length && signature !== fitted.current) {
      fitted.current = signature;
      const bounds = L.latLngBounds(groups.map((g) => [g.point.lat, g.point.lng] as [number, number]));
      m.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
    }
  }, [groups, ready]);

  // The selected item's pin.
  useEffect(() => {
    const marker = selectedId ? markers.current.get(selectedId) : undefined;
    if (!marker || !map.current) return;
    map.current.panTo(marker.getLatLng(), { animate: true });
    marker.openPopup();
  }, [selectedId, groups, ready]);

  return <div ref={box} className="tt-map" role="region" aria-label="Map of this week's places" />;
}
