import "server-only";

import { auth } from "@/lib/auth/auth";
import type { AppSessionUser } from "@/lib/auth/types";
import { getFarmForSession } from "@/lib/farm/current-farm";
import { getFarmAnalyticsSnapshot } from "@/lib/analytics/analytics-service";
import { getFarmHistoricalAnalytics } from "@/lib/analytics/historical-analytics-service";

/**
 * `GET /api/analytics` — a single efficient farm-scoped
 * aggregate endpoint rather than one small endpoint per metric ("do NOT
 * create many small endpoints that cause unnecessary network requests").
 * Mirrors `/api/drones`'s auth/farm-scoping shape exactly. Used as a
 * client-side fallback fetch by `AnalyticsPage` (e.g. after locally
 * creating/completing a mission, without a full page reload) — the primary
 * load path is the Server Component in `app/(shell)/analytics/page.tsx`,
 * which calls `getFarmAnalyticsSnapshot`/`getFarmHistoricalAnalytics`
 * directly, no HTTP round-trip.
 *
 * This change adds `history` (real historical findings/mission/robot-
 * effectiveness/plot-health analytics from `historical-analytics-service.ts`)
 * alongside the existing point-in-time `snapshot` — additive, same response
 * shape's `snapshot` key is unchanged so nothing that already reads it breaks.
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

  try {
    const [snapshot, history] = await Promise.all([getFarmAnalyticsSnapshot(farm.id), getFarmHistoricalAnalytics(farm.id)]);
    return Response.json({ snapshot, history });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unexpected error." }, { status: 500 });
  }
}
