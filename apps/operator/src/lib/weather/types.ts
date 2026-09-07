/**
 * Shared Weather types — imported by both server code (the
 * `/api/weather` route, `weather-provider.ts`) and client code (the Weather
 * Store, the Weather page, the Command Center widget, AURA's context), so
 * this module stays free of any server-only or client-only import, same
 * rule `lib/aura/types.ts` documents for itself.
 */

/** A single day's forecast — every field is real data from the provider, or `null` if that provider genuinely didn't return it (never fabricated). */
export interface WeatherForecastDay {
  /** ISO date (YYYY-MM-DD), the provider's own local-time date for this farm's coordinates. */
  date: string;
  conditionCode: number;
  conditionText: string;
  tempMaxC: number | null;
  tempMinC: number | null;
  precipitationProbabilityPercent: number | null;
  precipitationMm: number | null;
  windSpeedMaxKmh: number | null;
  windDirectionDeg: number | null;
  uvIndexMax: number | null;
}

/** Current conditions — every field real-data-or-null, same rule as above. */
export interface WeatherCurrent {
  temperatureC: number | null;
  apparentTemperatureC: number | null;
  conditionCode: number;
  conditionText: string;
  humidityPercent: number | null;
  windSpeedKmh: number | null;
  windDirectionDeg: number | null;
  windGustsKmh: number | null;
  precipitationMm: number | null;
  isDay: boolean | null;
  /** Open-Meteo's current-conditions endpoint doesn't return visibility/UV — both stay `null` here (never fabricated) and the UI shows an explicit "not provided by this API" state rather than omitting the row silently. */
  visibilityMeters: number | null;
  uvIndex: number | null;
}

export type WeatherRiskLevel = "favorable" | "caution" | "high-risk";

export interface WeatherRiskFactor {
  level: WeatherRiskLevel;
  reason: string;
}

/**
 * The agricultural-operations layer computed FROM the
 * real weather values above by `agricultural-analysis.ts`, using the single
 * centralized threshold table in `weather-thresholds.ts`. Purely
 * informational ("DO NOT automatically cancel or modify missions")
 * — every field here is advisory text/levels for a human operator to read,
 * never an executable instruction.
 */
export interface AgriculturalWeatherAnalysis {
  droneOperations: WeatherRiskFactor;
  robotOperations: WeatherRiskFactor;
  fieldConditions: WeatherRiskFactor;
  rainRisk: WeatherRiskFactor;
  windRisk: WeatherRiskFactor;
  heatRisk: WeatherRiskFactor;
  /** Deliberately worded as "consideration", never a directive — see the explicit wording requirement. */
  irrigationConsideration: WeatherRiskFactor;
  /** Plain-language notes connecting weather to mission operations (Part 7) — informational only, e.g. "Drone missions may be affected by strong winds." Never an instruction to cancel/reschedule anything. */
  missionNotes: string[];
}

export interface WeatherSnapshot {
  latitude: number;
  longitude: number;
  timezone: string;
  current: WeatherCurrent;
  forecast: WeatherForecastDay[];
  analysis: AgriculturalWeatherAnalysis;
  /** ISO timestamp this snapshot was actually fetched from the provider (not when the client read it from cache) — the Weather page's "Last updated" / staleness indicator uses this. */
  fetchedAt: string;
  source: string;
}

/** The `/api/weather` response shape — always one of these three states, never a partial/ambiguous one. */
export type WeatherApiResponse =
  | { locationConfigured: false }
  | { locationConfigured: true; available: true; data: WeatherSnapshot; stale: boolean }
  | { locationConfigured: true; available: false; error: string };
