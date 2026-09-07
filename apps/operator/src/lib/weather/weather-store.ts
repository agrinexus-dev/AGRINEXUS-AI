"use client";

import { create } from "zustand";
import { getSession } from "next-auth/react";

import type { AppSessionUser } from "@/lib/auth/types";

import type { WeatherApiResponse, WeatherSnapshot } from "./types";

/**
 * The Weather Store — the single client-side source of truth
 * for weather, mirroring `fleet-store.ts`/`robot-store.ts`'s own
 * `hydration`/`fetch*` pattern exactly (same states: "idle"/"loading"/
 * "loaded"/"error"). Read by the Weather page, the Command Center's
 * `WeatherWidget`, and AURA's `collect-context.ts` — ONE fetch, ONE shared
 * result, never three separate copies of the same data ("Do not
 * create a second weather system").
 *
 * SECURITY FIX — `fetchWeather()` used to be guarded by a plain
 * module-level `hydrationAttempted` boolean: once any farm's weather loaded
 * successfully, it stayed `true` for the rest of the browser tab's JS
 * lifetime, with no concept of WHICH farm it was hydrated for. Because
 * logging in as a different account is an SPA transition here (`signIn()` +
 * `router.push()`, never a hard reload — see `login-form.tsx`), that flag
 * could survive a same-tab farm switch and silently prevent the new farm's
 * `fetchWeather()` call (fired again by `AppShell`/`AuraMount` remounting)
 * from ever reaching `/api/weather` — leaving the PREVIOUS farm's weather
 * visible (including inside `AuraContext`) under the new farm's session.
 * `/api/weather` itself was already, and remains, correctly farm-scoped
 * server-side (`auth()` → `getFarmForSession()` → the farm's own saved
 * location — never a client-supplied coordinate); this was purely a
 * client-side caching defect, not an authorization gap.
 *
 * The fix replaces that boolean with `hydratedForUserId` — which
 * authenticated user's weather (if any) the store's current data actually
 * reflects, read via `getSession()` (the same imperative session read
 * `login-form.tsx` already uses). This is used ONLY to decide whether a
 * fresh fetch is warranted, exactly like the old boolean was — it is never
 * sent to the server and never used to authorize anything; the server
 * re-resolves the farm from its own session cookie on every request
 * regardless of what this module remembers. A `requestToken` counter
 * (bumped on every new fetch attempt) additionally protects against a
 * stale, slow response from a farm the user has since switched away from
 * ever committing over a newer farm's already-loaded state.
 */
interface WeatherState {
  locationConfigured: boolean | null;
  data: WeatherSnapshot | null;
  stale: boolean;
  hydration: "idle" | "loading" | "loaded" | "error";
  hydrationError: string | null;
}

export const useWeatherStore = create<WeatherState>(() => ({
  locationConfigured: null,
  data: null,
  stale: false,
  hydration: "idle",
  hydrationError: null,
}));

/** Which authenticated user's weather the store currently reflects — `null` means "nobody's, yet" (fresh tab, or the last attempt never completed successfully). Never used for authorization; see this file's top doc comment. */
let hydratedForUserId: string | null = null;
/** The identity a request is currently in flight for, if any — lets a second call for the SAME identity no-op (preserving the original "at most one real request" behavior, now scoped per-identity) without blocking a call for a genuinely DIFFERENT identity (a farm switch) from starting its own request. */
let pendingRequestForUserId: string | null = null;
/** Bumped on every fetch attempt; a response is only committed to the store if it's still the most recent attempt by the time it resolves — see `loadWeather`'s own two checks below. */
let requestToken = 0;

async function currentUserId(): Promise<string | null> {
  const session = await getSession();
  return (session?.user as AppSessionUser | undefined)?.id ?? null;
}

/** The actual GET + state-update logic, shared by `fetchWeather()` (guarded, at-most-once-per-identity) and `refetchWeather()` — always issues a real request, used right after a location save. Never throws for an honest terminal state (not configured / provider unavailable); rethrows only for a genuine request failure. */
async function loadWeather(token: number, forUserId: string | null): Promise<void> {
  // Superseded before this attempt even started (a newer call already
  // bumped `requestToken`) — never show a "loading" flicker for a farm
  // that's already no longer current.
  if (token !== requestToken) return;
  useWeatherStore.setState({ hydration: "loading", hydrationError: null });

  try {
    const response = await fetch("/api/weather");
    if (!response.ok) {
      throw new Error(`Request failed (${response.status}).`);
    }
    const body = (await response.json()) as WeatherApiResponse;

    // Stale-response protection: if a newer `fetchWeather()`/
    // `refetchWeather()` call (e.g. triggered by a same-tab farm switch)
    // started while this request was in flight, `requestToken` has already
    // moved on — this response no longer describes the current farm/session
    // and must never commit over (or alongside) whatever that newer call
    // has since written.
    if (token !== requestToken) return;

    if (!body.locationConfigured) {
      useWeatherStore.setState({ locationConfigured: false, data: null, stale: false, hydration: "loaded", hydrationError: null });
    } else if (!body.available) {
      useWeatherStore.setState({ locationConfigured: true, hydration: "error", hydrationError: body.error });
    } else {
      useWeatherStore.setState({ locationConfigured: true, data: body.data, stale: body.stale, hydration: "loaded", hydrationError: null });
    }
    hydratedForUserId = forUserId;
  } catch (error) {
    if (token !== requestToken) return; // same stale-response protection for the error path
    useWeatherStore.setState({ hydration: "error", hydrationError: error instanceof Error ? error.message : "Failed to load weather data." });
    throw error;
  }
}

/** Called from `aura-mount.tsx` (guaranteed-mount pattern) and from the Weather page itself, so weather is ready regardless of which page is opened first — mirrors `fetchAutonomousState`'s own doc comment and guard exactly. At most one real request per authenticated identity (repeat calls for the SAME identity are a no-op); a call for a DIFFERENT identity than the store currently reflects (a farm switch) always issues a fresh request. */
export async function fetchWeather(): Promise<void> {
  const userId = await currentUserId();
  if (hydratedForUserId === userId || pendingRequestForUserId === userId) return;

  pendingRequestForUserId = userId;
  const token = ++requestToken;
  try {
    await loadWeather(token, userId);
  } catch {
    // allow a retry the next time fetchWeather() is called for this identity
  } finally {
    if (pendingRequestForUserId === userId) pendingRequestForUserId = null;
  }
}

/**
 * Forces a genuinely fresh `/api/weather` request,
 * bypassing `fetchWeather`'s per-identity guard. The ONLY caller is the
 * farm-location save flow (`farm-location-selector.tsx`): after
 * `PATCH /api/farm/location` succeeds, the newly-saved coordinates mean the
 * NEXT `GET /api/weather` will naturally hit a different cache key on the
 * server (`weather-provider.ts`'s cache is keyed by rounded lat/lon — see
 * that file), so this doesn't need to know or care about the new
 * coordinates itself; it just needs to guarantee a real round-trip happens
 * instead of silently reusing whatever the store already holds. Records the
 * current identity as hydrated afterward (a normal successful/terminal
 * fetch, same as `fetchWeather`'s own success path) so later page mounts
 * this session don't redundantly re-fetch again for the same identity.
 */
export async function refetchWeather(): Promise<void> {
  const userId = await currentUserId();
  pendingRequestForUserId = userId;
  const token = ++requestToken;
  try {
    await loadWeather(token, userId);
  } finally {
    if (pendingRequestForUserId === userId) pendingRequestForUserId = null;
  }
}

export function useWeatherHydration(): { status: WeatherState["hydration"]; error: string | null; locationConfigured: boolean | null } {
  const status = useWeatherStore((state) => state.hydration);
  const error = useWeatherStore((state) => state.hydrationError);
  const locationConfigured = useWeatherStore((state) => state.locationConfigured);
  return { status, error, locationConfigured };
}
