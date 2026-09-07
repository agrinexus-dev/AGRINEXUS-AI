"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Check, MapPin, X } from "lucide-react";

import { Button, Card, CardContent, CardHeader, CardTitle, Skeleton, Typography } from "@agrinexus/ui";

import { refetchWeather } from "@/lib/weather/weather-store";

/**
 * The Farm Location card: shows the currently-saved
 * real-world location (or an honest "not configured" prompt), and opens the
 * interactive map to select/change it. Reads/writes `/api/farm/location`
 * directly (a farm-scoped route) rather than deriving
 * location from the Weather Store's `WeatherSnapshot.latitude/longitude` —
 * that field is only populated when the weather PROVIDER call itself
 * succeeded, so it can't reliably answer "is a location configured" when
 * Open-Meteo is down but a location genuinely IS saved (Part 5 State 7).
 * This card's own location fetch is fast and never touches Open-Meteo.
 *
 * `FarmLocationMap` is loaded via `next/dynamic({ ssr: false })` — Leaflet
 * reads `window`/`document` at import time and cannot run during Next.js's
 * server render.
 */

const FarmLocationMap = dynamic(() => import("./farm-location-map").then((mod) => mod.FarmLocationMap), {
  ssr: false,
  loading: () => <Skeleton className="h-full min-h-72 w-full rounded-xl" />,
});

interface SavedLocation {
  latitude: number;
  longitude: number;
}

type ViewState = "loading" | "idle" | "selecting" | "saving" | "load-error";

export function FarmLocationSelector() {
  const [viewState, setViewState] = useState<ViewState>("loading");
  const [saved, setSaved] = useState<SavedLocation | null>(null);
  const [draft, setDraft] = useState<{ lat: number; lng: number } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    void loadCurrentLocation();
  }, []);

  async function loadCurrentLocation() {
    setViewState("loading");
    setLoadError(null);
    try {
      const response = await fetch("/api/farm/location");
      if (!response.ok) throw new Error(`Request failed (${response.status}).`);
      const body = (await response.json()) as { location: SavedLocation | null };
      setSaved(body.location);
      setViewState("idle");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Couldn't load the farm's saved location.");
      setViewState("load-error");
    }
  }

  function startSelecting() {
    // Pre-fill the draft with whatever's already saved (Part 2: changing an
    // existing location starts from that point, not from scratch) — `null`
    // when nothing is saved yet, so the map opens with no marker until the
    // operator actually clicks somewhere.
    setDraft(saved ? { lat: saved.latitude, lng: saved.longitude } : null);
    setSaveError(null);
    setViewState("selecting");
  }

  function cancelSelecting() {
    // Part 2 — discard the draft entirely; the previously SAVED location
    // (server state, `saved`) is left completely untouched.
    setDraft(null);
    setSaveError(null);
    setViewState("idle");
  }

  async function confirmSelection() {
    if (!draft) return;
    setViewState("saving");
    setSaveError(null);
    try {
      const response = await fetch("/api/farm/location", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude: draft.lat, longitude: draft.lng }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Couldn't save location (${response.status}).`);
      }
      const body = (await response.json()) as { location: SavedLocation };
      setSaved(body.location);
      setViewState("idle");
      // Part 6 — the whole point of saving: weather must reflect the NEW
      // coordinates immediately, no browser refresh needed. `refetchWeather`
      // bypasses the Weather Store's once-per-session guard and issues a
      // genuinely fresh `GET /api/weather`, which (now that the DB row is
      // updated) resolves the new location and — via `weather-provider.ts`'s
      // coordinate-keyed cache — can never return the OLD location's cached
      // data. Best-effort: a failure here still leaves the
      // location itself correctly saved; the Weather page's own error state
      // (reading the same store) surfaces it if the refetch itself fails.
      void refetchWeather().catch(() => {});
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Couldn't save the farm location.");
      setViewState("selecting");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="size-4 text-foreground-muted" aria-hidden />
          Farm Location
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {viewState === "loading" ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        ) : null}

        {viewState === "load-error" ? (
          <div className="flex flex-col gap-2">
            <Typography variant="small" className="text-critical" role="alert">
              {loadError ?? "Couldn't load the farm's saved location."}
            </Typography>
            <Button intent="secondary" size="sm" className="w-fit" onClick={() => void loadCurrentLocation()}>
              Retry
            </Button>
          </div>
        ) : null}

        {viewState === "idle" ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <Typography variant="small" className="text-foreground">
                  Location: {saved ? "Configured" : "Not configured"}
                </Typography>
                <Typography variant="caption" className="font-mono text-foreground-subtle">
                  {saved ? `${saved.latitude.toFixed(4)}, ${saved.longitude.toFixed(4)}` : "No coordinates set"}
                </Typography>
              </div>
              <Button intent={saved ? "secondary" : "primary"} size="sm" leadingIcon={<MapPin />} onClick={startSelecting}>
                {saved ? "Change Location" : "Set Farm Location"}
              </Button>
            </div>
            {!saved ? (
              <Typography variant="caption" className="text-foreground-subtle">
                Select your farm&apos;s real-world location to receive local weather and agricultural analysis.
              </Typography>
            ) : null}
          </div>
        ) : null}

        {viewState === "selecting" || viewState === "saving" ? (
          <div className="flex flex-col gap-3">
            <Typography variant="caption" className="text-foreground-subtle">
              Click anywhere on the map to place a marker at your farm&apos;s real-world location. Pan and zoom first if you need to find it
              precisely.
            </Typography>
            <div className="h-80 w-full overflow-hidden rounded-xl border border-border-subtle">
              <FarmLocationMap selected={draft} onSelect={(lat, lng) => setDraft({ lat, lng })} className="h-full w-full" />
            </div>
            {/* `sm:pr-20` keeps this row's buttons clear of AURA's own
                always-on-top floating launcher (`aura-launcher.tsx`, fixed
                `right-5 bottom-5`, ~76px square) — found via live visual
                testing: on a short viewport with nothing below this card,
                "Confirm Location" rendered flush against the page's right
                edge and got visually clipped by that fixed button. Fixing
                it here (this component's own layout) rather than touching
                the unrelated, correctly-behaving launcher itself. */}
            <div className="flex flex-wrap items-center justify-between gap-3 sm:pr-20">
              <Typography variant="small" className="font-mono text-foreground">
                {draft ? `Selected: ${draft.lat.toFixed(4)}, ${draft.lng.toFixed(4)}` : "No point selected yet — click the map."}
              </Typography>
              <div className="flex items-center gap-2">
                <Button intent="ghost" size="sm" leadingIcon={<X />} onClick={cancelSelecting} disabled={viewState === "saving"}>
                  Cancel
                </Button>
                <Button
                  intent="primary"
                  size="sm"
                  leadingIcon={<Check />}
                  onClick={() => void confirmSelection()}
                  disabled={!draft || viewState === "saving"}
                  loading={viewState === "saving"}
                >
                  {viewState === "saving" ? "Saving farm location…" : "Confirm Location"}
                </Button>
              </div>
            </div>
            {saveError ? (
              <Typography variant="small" className="text-critical" role="alert">
                {saveError}
              </Typography>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
