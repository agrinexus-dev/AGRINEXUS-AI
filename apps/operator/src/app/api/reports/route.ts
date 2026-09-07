import "server-only";

import { auth } from "@/lib/auth/auth";
import type { AppSessionUser } from "@/lib/auth/types";
import { getFarmForSession } from "@/lib/farm/current-farm";
import { getFarmSummaryFacts, getMissionReportFacts, getSensorReportFacts } from "@/lib/reports/reports-service";

/**
 * `GET /api/reports?kind=<kind>` — one endpoint, one
 * query param, mirroring `/api/analytics`'s "don't create many small
 * endpoints" reasoning. `kind=analytics-report` returns `{ facts: null }`
 * on purpose — that report kind has no backend-derivable facts beyond what
 * `getAllPlotRecommendations()` already computes client-side; see
 * `reports-service.ts`'s own doc comment for why.
 */

const VALID_KINDS = new Set(["farm-summary", "mission-report", "sensor-report", "analytics-report"]);

export async function GET(request: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  const farm = await getFarmForSession(session.user as AppSessionUser);
  if (!farm) {
    return Response.json({ error: "No farm is associated with this account." }, { status: 403 });
  }

  const kind = new URL(request.url).searchParams.get("kind");
  if (!kind || !VALID_KINDS.has(kind)) {
    return Response.json({ error: "Invalid or missing report kind." }, { status: 400 });
  }

  try {
    switch (kind) {
      case "farm-summary":
        return Response.json({ facts: await getFarmSummaryFacts(farm.id) });
      case "mission-report":
        return Response.json({ facts: await getMissionReportFacts(farm.id) });
      case "sensor-report":
        return Response.json({ facts: await getSensorReportFacts(farm.id) });
      default:
        return Response.json({ facts: null });
    }
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unexpected error." }, { status: 500 });
  }
}
