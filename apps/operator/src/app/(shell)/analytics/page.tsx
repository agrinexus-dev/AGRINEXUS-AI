import { AnalyticsPage } from "@/components/analytics/analytics-page";
import { auth } from "@/lib/auth/auth";
import type { AppSessionUser } from "@/lib/auth/types";
import { getFarmForSession } from "@/lib/farm/current-farm";
import { getFarmAnalyticsSnapshot } from "@/lib/analytics/analytics-service";
import { getFarmHistoricalAnalytics } from "@/lib/analytics/historical-analytics-service";

/**
 * Server Component ("prefer Server Component → server-
 * side analytics query → Client Component receives initial data") — calls
 * `getFarmAnalyticsSnapshot` directly in-process (no HTTP round-trip to its
 * own `/api/analytics`), mirroring `digital-twin/page.tsx`'s Plot-fetching
 * precedent. Falls back to `null` (which `AnalyticsPage`
 * treats as "fetch client-side instead") if the session/farm can't be
 * resolved here — this route is already behind the shell's auth-gating
 * middleware, so that's a defensive fallback, not the expected path.
 *
 * Also falls back to `null` if the aggregate query itself throws (e.g. a
 * transient database outage) rather than letting that crash the whole
 * page — `AnalyticsPage` already degrades gracefully to a client-side
 * `/api/analytics` fetch (and, failing that, to the reasoning-engine-only
 * metrics it always computed earlier), so a DB hiccup here should never
 * be worse than the earlier behavior.
 *
 * This change additionally fetches `getFarmHistoricalAnalytics` in the
 * same pass (`Promise.all`, one round-trip to the database) and hands it to
 * `AnalyticsPage` as `initialHistory` — same "server-fetch first, client
 * falls back to `/api/analytics`" pattern as `initialSnapshot`, kept
 * independent so a failure in one never blocks the other from rendering.
 */
export default async function Page() {
  const session = await auth();
  const farm = session?.user ? await getFarmForSession(session.user as AppSessionUser) : null;

  let initialSnapshot = null;
  let initialHistory = null;
  if (farm) {
    const [snapshotResult, historyResult] = await Promise.allSettled([getFarmAnalyticsSnapshot(farm.id), getFarmHistoricalAnalytics(farm.id)]);
    if (snapshotResult.status === "fulfilled") initialSnapshot = snapshotResult.value;
    if (historyResult.status === "fulfilled") initialHistory = historyResult.value;
  }

  return <AnalyticsPage initialSnapshot={initialSnapshot} initialHistory={initialHistory} />;
}
