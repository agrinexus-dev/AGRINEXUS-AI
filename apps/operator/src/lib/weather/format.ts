/** Shared formatting helpers — used by both the Weather page and `collect-context.ts` so wind-direction text is computed identically everywhere, not duplicated. */
const COMPASS_DIRECTIONS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

export function degreesToCompass(deg: number): string {
  return COMPASS_DIRECTIONS[Math.round(deg / 22.5) % 16]!;
}
