import "server-only";

import { computeAgriculturalAnalysis } from "./agricultural-analysis";
import type { WeatherCurrent, WeatherForecastDay, WeatherSnapshot } from "./types";
import { wmoConditionText } from "./wmo-codes";

/**
 * Real weather data via Open-Meteo
 * (https://open-meteo.com/en/docs), chosen after the user was asked (no
 * weather provider or API key existed anywhere in this project — see the
 * an investigation) because it needs no
 * API key/signup at all, so the SAME real-provider integration this file
 * implements can be genuinely tested end-to-end without a credential this
 * environment has no way to obtain. Server-only (this whole module can
 * never be imported by client code — `"server-only"` above enforces it at
 * build time), even though Open-Meteo itself needs no secret: farm
 * coordinates are resolved server-side from the authenticated session (see
 * `app/api/weather/route.ts`), never trusted from client input, matching
 * every other `*-service.ts` in this repo.
 */

const OPEN_METEO_BASE_URL = "https://api.open-meteo.com/v1/forecast";
const FORECAST_DAYS = 7;

/** How long a fetched snapshot is served from the in-memory cache before a fresh request is made. Weather doesn't change fast enough to justify hitting the provider on every page view, and this keeps well inside Open-Meteo's free-tier rate limits. A plain in-memory `Map` (Part 11: "avoid creating a complicated caching system unnecessarily") — same "cached on globalThis/module scope in the Node process" idea `lib/prisma/client.ts` already uses for its client singleton, not a new caching layer/library. */
const CACHE_TTL_MS = 15 * 60 * 1000;

interface CacheEntry {
  snapshot: WeatherSnapshot;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(latitude: number, longitude: number): string {
  return `${latitude.toFixed(3)},${longitude.toFixed(3)}`;
}

interface OpenMeteoResponse {
  timezone: string;
  current?: {
    temperature_2m: number;
    relative_humidity_2m: number;
    apparent_temperature: number;
    is_day: number;
    precipitation: number;
    weather_code: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
    wind_gusts_10m: number;
  };
  daily?: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    precipitation_probability_max: number[];
    wind_speed_10m_max: number[];
    wind_direction_10m_dominant: number[];
    uv_index_max: number[];
  };
}

function parseCurrent(raw: OpenMeteoResponse["current"]): WeatherCurrent {
  if (!raw) {
    return {
      temperatureC: null,
      apparentTemperatureC: null,
      conditionCode: 0,
      conditionText: "Unavailable",
      humidityPercent: null,
      windSpeedKmh: null,
      windDirectionDeg: null,
      windGustsKmh: null,
      precipitationMm: null,
      isDay: null,
      visibilityMeters: null,
      uvIndex: null,
    };
  }
  return {
    temperatureC: raw.temperature_2m,
    apparentTemperatureC: raw.apparent_temperature,
    conditionCode: raw.weather_code,
    conditionText: wmoConditionText(raw.weather_code),
    humidityPercent: raw.relative_humidity_2m,
    windSpeedKmh: raw.wind_speed_10m,
    windDirectionDeg: raw.wind_direction_10m,
    windGustsKmh: raw.wind_gusts_10m,
    precipitationMm: raw.precipitation,
    isDay: raw.is_day === 1,
    // Open-Meteo's `current` block doesn't include visibility or UV index
    // (UV index is a DAILY-only field for this provider) — both left
    // honestly `null` here rather than fabricated. The Weather page shows
    // an explicit "not provided by this data source" state for these.
    visibilityMeters: null,
    uvIndex: null,
  };
}

function parseForecast(raw: OpenMeteoResponse["daily"]): WeatherForecastDay[] {
  if (!raw) return [];
  return raw.time.map((date, i) => ({
    date,
    conditionCode: raw.weather_code[i]!,
    conditionText: wmoConditionText(raw.weather_code[i]!),
    tempMaxC: raw.temperature_2m_max[i] ?? null,
    tempMinC: raw.temperature_2m_min[i] ?? null,
    precipitationProbabilityPercent: raw.precipitation_probability_max[i] ?? null,
    precipitationMm: raw.precipitation_sum[i] ?? null,
    windSpeedMaxKmh: raw.wind_speed_10m_max[i] ?? null,
    windDirectionDeg: raw.wind_direction_10m_dominant[i] ?? null,
    uvIndexMax: raw.uv_index_max[i] ?? null,
  }));
}

export class WeatherProviderError extends Error {}

/**
 * Fetches (or reuses a fresh cached copy of) real weather for one
 * coordinate. Throws `WeatherProviderError` for every expected failure
 * (network error, non-OK response, malformed body) — the caller
 * (`/api/weather`) is the one place that turns that into the honest
 * `{available: false}` API response; this function never returns a
 * fabricated/partial snapshot on failure.
 */
export async function fetchWeatherSnapshot(latitude: number, longitude: number): Promise<{ snapshot: WeatherSnapshot; stale: boolean }> {
  const key = cacheKey(latitude, longitude);
  const cached = cache.get(key);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return { snapshot: cached.snapshot, stale: false };
  }

  try {
    const url = new URL(OPEN_METEO_BASE_URL);
    url.searchParams.set("latitude", String(latitude));
    url.searchParams.set("longitude", String(longitude));
    url.searchParams.set("current", "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m");
    url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_direction_10m_dominant,uv_index_max");
    url.searchParams.set("timezone", "auto");
    url.searchParams.set("forecast_days", String(FORECAST_DAYS));
    url.searchParams.set("wind_speed_unit", "kmh");

    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) {
      throw new WeatherProviderError(`Weather provider returned ${response.status}.`);
    }
    const body = (await response.json()) as OpenMeteoResponse;

    const current = parseCurrent(body.current);
    const forecast = parseForecast(body.daily);
    const analysis = computeAgriculturalAnalysis(current, forecast[0]);

    const snapshot: WeatherSnapshot = {
      latitude,
      longitude,
      timezone: body.timezone,
      current,
      forecast,
      analysis,
      fetchedAt: new Date().toISOString(),
      source: "Open-Meteo",
    };

    cache.set(key, { snapshot, expiresAt: now + CACHE_TTL_MS });
    return { snapshot, stale: false };
  } catch (error) {
    // Fail-open onto a still-usable STALE cached copy, if one exists — same
    // "clearly indicate the data may be stale" requirement Part 10 asks
    // for, rather than a hard error when the provider has a brief outage
    // but we already have something real to show.
    if (cached) {
      return { snapshot: cached.snapshot, stale: true };
    }
    if (error instanceof WeatherProviderError) throw error;
    throw new WeatherProviderError(error instanceof Error ? error.message : "Weather provider request failed.");
  }
}
