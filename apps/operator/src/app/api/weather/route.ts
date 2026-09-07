import "server-only";

import { auth } from "@/lib/auth/auth";
import type { AppSessionUser } from "@/lib/auth/types";
import { getFarmLocation } from "@/lib/farm/farm-location-service";
import { getFarmForSession } from "@/lib/farm/current-farm";
import { fetchWeatherSnapshot, WeatherProviderError } from "@/lib/weather/weather-provider";
import type { WeatherApiResponse } from "@/lib/weather/types";

/**
 * `GET /api/weather` — farm-scoped exactly like every other
 * resource in this app: the farm's location is resolved server-side from
 * the authenticated session (`getFarmForSession` → `getFarmLocation`),
 * NEVER from a client-supplied coordinate — a request can't ask for a
 * different farm's weather by passing different numbers, preserving farm
 * isolation the same way `/api/farm/autonomous` already does for its own
 * farm-scoped resource.
 *
 * Always returns 200 with one of three honest states in the body
 * (`WeatherApiResponse`) rather than using HTTP status codes to distinguish
 * them — "farm location not configured" and "provider temporarily
 * unavailable" are both legitimate, expected states for this route, not
 * request errors.
 */
export async function GET(): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  const farm = await getFarmForSession(session.user as AppSessionUser);
  if (!farm) {
    return Response.json({ error: "No farm is associated with this account." }, { status: 403 });
  }

  const location = await getFarmLocation(farm.id);
  if (!location) {
    const body: WeatherApiResponse = { locationConfigured: false };
    return Response.json(body);
  }

  try {
    const { snapshot, stale } = await fetchWeatherSnapshot(location.latitude, location.longitude);
    const body: WeatherApiResponse = { locationConfigured: true, available: true, data: snapshot, stale };
    return Response.json(body);
  } catch (error) {
    // A `WeatherProviderError` (network failure, bad response, timeout) is
    // an honest "temporarily unavailable" state, never a 500 — nothing
    // about the REQUEST was wrong. Never includes the raw error/stack in
    // the response (Part 12 — no secrets/internal detail leakage), and
    // there is no API key anywhere in this path to accidentally expose in
    // the first place (Open-Meteo needs none).
    const message = error instanceof WeatherProviderError ? error.message : "Weather data is temporarily unavailable.";
    const body: WeatherApiResponse = { locationConfigured: true, available: false, error: message };
    return Response.json(body);
  }
}
