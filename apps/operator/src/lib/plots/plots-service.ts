import "server-only";

import { prisma } from "@/lib/prisma/client";
import type { CropGrowthStage, FarmPlotDefinition } from "@/components/digital-twin/scene/farm-data";

/**
 * Server-only Plot data access — mirrors
 * `alerts-service.ts`/`sensors-service.ts`'s exact shape: every function
 * takes `farmId` explicitly, every caller derives it from the authenticated
 * session, never from client input.
 *
 * READ-ONLY by design — audited the existing UI (`add-sensor-dialog.tsx`'s
 * plot picker, mission planners' plot selectors, the Digital Twin) and
 * found no Add/Edit/Delete Plot feature anywhere, unlike Sensor. Only
 * `listPlots`/`getPlot` exist, per every 018x prompt's own "don't add CRUD
 * the UI doesn't need" rule.
 */

type PlotRow = {
  id: string;
  label: string;
  centerX: number;
  centerZ: number;
  sizeWidth: number;
  sizeDepth: number;
  growthStage: CropGrowthStage;
};

function toDomainPlot(row: PlotRow): FarmPlotDefinition {
  return {
    id: row.id,
    label: row.label,
    center: [row.centerX, row.centerZ],
    size: [row.sizeWidth, row.sizeDepth],
    growthStage: row.growthStage,
  };
}

export async function listPlots(farmId: string): Promise<FarmPlotDefinition[]> {
  const rows = await prisma.plot.findMany({ where: { farmId }, orderBy: { id: "asc" } });
  return rows.map(toDomainPlot);
}

/** `null` (not thrown) for "doesn't exist or belongs to a different farm" — same non-leaking pattern the other 018x services use. */
export async function getPlot(farmId: string, plotId: string): Promise<FarmPlotDefinition | null> {
  const row = await prisma.plot.findUnique({ where: { id: plotId } });
  if (!row || row.farmId !== farmId) return null;
  return toDomainPlot(row);
}
