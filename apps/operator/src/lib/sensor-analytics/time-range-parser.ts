import type { HistoricalSample, TimeRangeId } from "./types";

/**
 * Minimal time-range phrase parser ("Time Range Support") — pure
 * text in, a `TimeRangeId` out, no store dependency (mirrors the pure-text
 * rule every capture function in `aura/commands/command-parser.ts` already
 * follows). Deliberately does NOT rewrite `trend-analysis.ts` — this just
 * resolves which of the EXISTING `TimeRangeId`s (`types.ts`, already used by
 * the Historical Dashboard's own range buttons) a spoken/typed phrase means,
 * so the same `computeTrendStats`/`TIME_RANGE_MS` the dashboard already uses
 * can be reused by AURA's commands too.
 */
const TIME_RANGE_PHRASES: { range: TimeRangeId; patterns: RegExp[] }[] = [
  { range: "24h", patterns: [/last\s+24\s+hours?/, /past\s+24\s+hours?/, /\btoday\b/, /last\s+day\b/] },
  { range: "7d", patterns: [/last\s+7\s+days?/, /past\s+7\s+days?/, /past\s+week\b/, /last\s+week\b/, /this\s+week\b/] },
  { range: "30d", patterns: [/last\s+30\s+days?/, /past\s+30\s+days?/, /past\s+month\b/, /last\s+month\b/, /this\s+month\b/] },
];

/** Resolves a spoken/typed range phrase (e.g. "soil moisture over the last 7 days") to a `TimeRangeId` — `undefined` when no range phrase is present, so callers can fall back to their own default (whatever the store currently holds, unchanged from before this prompt). */
export function matchTimeRangePhrase(normalized: string): TimeRangeId | undefined {
  for (const entry of TIME_RANGE_PHRASES) {
    if (entry.patterns.some((pattern) => pattern.test(normalized))) return entry.range;
  }
  return undefined;
}

/** Human label for a resolved range, for response text — reuses `TIME_RANGE_LABELS`'s own wording via the caller; this is just the fallback when no range was specified. */
export const DEFAULT_TIME_RANGE_LABEL = "the stored history";

/** Filters a sensor's samples down to a specific time range's window, ending "now" — the one new piece of logic Time Range Support needs; the actual statistics are still computed by the EXISTING `computeTrendStats`/`detectAnomalies` in `trend-analysis.ts`, untouched. */
export function filterSamplesByRange(samples: HistoricalSample[], rangeMs: number, now: number = Date.now()): HistoricalSample[] {
  const cutoff = now - rangeMs;
  return samples.filter((sample) => sample.timestamp >= cutoff);
}
