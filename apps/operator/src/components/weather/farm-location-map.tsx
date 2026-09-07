"use client";

import "leaflet/dist/leaflet.css";

import { divIcon } from "leaflet";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";

/**
 * The interactive REAL-WORLD location picker. Leaflet +
 * OpenStreetMap tiles: no map library existed anywhere in this project
 * (checked `package.json` and every `node_modules` entry before adding
 * one) — Leaflet is the lightest well-established choice that needs no
 * paid API key, and OSM's raster tile server is free for this kind of
 * light, attributed usage (attribution below is required, not decorative —
 * see https://www.openstreetmap.org/copyright).
 *
 * Deliberately isolated to this one file/concern: it only ever receives
 * and emits plain `{lat, lng}` numbers — real-world GPS decimal degrees,
 * the exact same shape `Farm.latitude`/`Farm.longitude` store. It has NO
 * awareness of `Plot.centerX/centerZ` or any other Digital-Twin scene
 * coordinate, and nothing in the Digital Twin imports this file — the two
 * coordinate systems never mix.
 *
 * A custom `divIcon` (a small inline-styled pin, no external image) is used
 * instead of Leaflet's default `Marker` icon — the default references PNG
 * assets by a relative path that doesn't resolve correctly under Next.js's
 * bundler without extra config; a self-contained divIcon sidesteps that
 * whole class of problem rather than adding asset-path configuration for a
 * single pin.
 */

const markerIcon = divIcon({
  className: "",
  html: `<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:#e05d38;border:2px solid white;transform:rotate(-45deg);box-shadow:0 1px 4px rgba(0,0,0,0.4);"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 22],
});

const DEFAULT_CENTER: [number, number] = [20, 0];
const DEFAULT_ZOOM = 2;
const SELECTED_ZOOM = 12;

interface FarmLocationMapProps {
  /** The point to show a marker at, if any — either the already-saved location or an in-progress selection. `null` shows no marker (nothing picked yet). */
  selected: { lat: number; lng: number } | null;
  onSelect: (lat: number, lng: number) => void;
  className?: string;
}

function ClickHandler({ onSelect }: { onSelect: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(event) {
      onSelect(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

export function FarmLocationMap({ selected, onSelect, className }: FarmLocationMapProps) {
  // `center`/`zoom` are only the INITIAL view (Leaflet's own `center`/`zoom`
  // props are mount-time-only, by design) — computed once from whatever
  // `selected` happens to be when this component first mounts (the
  // already-saved location, if any). Deliberately NOT re-centering the map
  // on every subsequent click: the marker moves to follow each click, but
  // the operator's current pan/zoom is left alone, which is what "pan and
  // zoom, then click precisely" actually requires.
  const center: [number, number] = selected ? [selected.lat, selected.lng] : DEFAULT_CENTER;
  const zoom = selected ? SELECTED_ZOOM : DEFAULT_ZOOM;

  return (
    <div className={className}>
      <MapContainer center={center} zoom={zoom} scrollWheelZoom style={{ height: "100%", width: "100%", borderRadius: "var(--radius-lg, 0.75rem)" }}>
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <ClickHandler onSelect={onSelect} />
        {selected ? <Marker position={[selected.lat, selected.lng]} icon={markerIcon} /> : null}
      </MapContainer>
    </div>
  );
}
