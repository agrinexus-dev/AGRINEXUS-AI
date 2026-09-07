/**
 * One-time dev seed for the Plot vertical slice — NOT part of
 * any app's runtime, run manually: `npx tsx scripts/seed-plots.ts` from
 * apps/operator (needs `DATABASE_URL` set, and `seed-alerts.ts`/
 * `seed-sensors.ts` already run so Users/Farms/Sensors exist).
 *
 * Seeds the SAME 4 plots `digital-twin/scene/farm-data.ts`'s `farmPlots`
 * defines (identical ids/labels/positions/sizes/growthStage — copied
 * verbatim, never silently altered) onto "AgriNexus Demo Farm", THEN
 * restores the 4 demo Sensors' `assignedPlotId` (nulled out as a staged
 * migration step — see migration `20260819125920_add_plots` and the Prompt
 * 018D report's "Migration" section for why). Also seeds one plot on the
 * isolated "Isolation Test Farm" for the cross-farm
 * security tests.
 */
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/lib/prisma/generated/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const DEMO_FARM_ID = "farm_demo";
const ISOLATION_FARM_ID = "farm_isolation_test";

// Verbatim copy of digital-twin/scene/farm-data.ts's `farmPlots` — see this
// file's own doc comment on why these values must never silently diverge
// from that array.
const DEMO_PLOTS = [
  { id: "plot-a", label: "Plot A", centerX: -13, centerZ: -13, sizeWidth: 20, sizeDepth: 20, growthStage: "mature" as const },
  { id: "plot-b", label: "Plot B", centerX: 13, centerZ: -13, sizeWidth: 20, sizeDepth: 20, growthStage: "growing" as const },
  { id: "plot-c", label: "Plot C", centerX: -13, centerZ: 13, sizeWidth: 20, sizeDepth: 20, growthStage: "seedling" as const },
  { id: "plot-d", label: "Plot D", centerX: 13, centerZ: 13, sizeWidth: 20, sizeDepth: 20, growthStage: "fallow" as const },
];

async function main() {
  for (const plot of DEMO_PLOTS) {
    await prisma.plot.upsert({
      where: { id: plot.id },
      update: {},
      create: { ...plot, farmId: DEMO_FARM_ID },
    });
  }

  // Restore the 4 demo sensors' assignedPlotId (nulled during the staged
  // migration) — same ids `seed-sensors.ts` already created.
  const restore: [string, string][] = [
    ["sensor-plot-a-moisture", "plot-a"],
    ["sensor-plot-b-temp", "plot-b"],
    ["sensor-plot-c-humidity", "plot-c"],
    ["sensor-plot-d-ph", "plot-d"],
  ];
  for (const [sensorId, plotId] of restore) {
    await prisma.sensor.updateMany({ where: { id: sensorId, assignedPlotId: null }, data: { assignedPlotId: plotId } });
  }

  const isolationPlot = await prisma.plot.upsert({
    where: { id: "plot-isolation-test" },
    update: {},
    create: {
      id: "plot-isolation-test",
      farmId: ISOLATION_FARM_ID,
      label: "Isolation Test Plot",
      centerX: 0,
      centerZ: 0,
      sizeWidth: 10,
      sizeDepth: 10,
      growthStage: "fallow",
    },
  });

  console.log("Seeded", DEMO_PLOTS.length, "demo plots, restored 4 sensor assignments, and 1 isolation-test plot:", isolationPlot.id);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
