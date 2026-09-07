/**
 * One-time dev seed for the Sensor vertical slice — NOT part
 * of any app's runtime, run manually: `npx tsx scripts/seed-sensors.ts` from
 * apps/operator (needs `DATABASE_URL` set, and `scripts/seed-alerts.ts`
 * already run at least once so the demo/isolation Users and Farms exist).
 *
 * Seeds the SAME 5 default sensors `sensor-store.ts`'s `seedDefaultSensors()`
 * creates client-side (identical ids/fields) onto the real "AgriNexus Demo
 * Farm" — so `fetchSensors()`'s merge-by-id logic (see that store's own doc
 * comment) never shows a duplicate-looking row for what's really the same
 * sensor. Also seeds one sensor + one properly-linked alert on the isolated
 * "Isolation Test Farm" (replacing the earlier seed's orphaned test alert, now
 * that Sensor is a real FK target) — purely for the
 * cross-farm security tests.
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

async function main() {
  const now = new Date();

  const demoSensors = [
    { id: "sensor-plot-a-moisture", name: "Plot A Soil Moisture", sensorType: "soil_moisture" as const, positionX: -18, positionZ: -18, assignedPlotId: "plot-a", reading: 40 },
    { id: "sensor-plot-b-temp", name: "Plot B Soil Temperature", sensorType: "soil_temperature" as const, positionX: 18, positionZ: -18, assignedPlotId: "plot-b", reading: 18 },
    { id: "sensor-plot-c-humidity", name: "Plot C Humidity", sensorType: "humidity" as const, positionX: -18, positionZ: 18, assignedPlotId: "plot-c", reading: 55 },
    { id: "sensor-plot-d-ph", name: "Plot D Soil pH", sensorType: "ph" as const, positionX: 18, positionZ: 18, assignedPlotId: "plot-d", reading: 6.5 },
    { id: "sensor-farm-weather", name: "Farm Weather Station", sensorType: "weather_station" as const, positionX: 0, positionZ: -28, assignedPlotId: null, reading: 22 },
  ];

  for (const spec of demoSensors) {
    await prisma.sensor.upsert({
      where: { id: spec.id },
      update: {},
      create: {
        id: spec.id,
        farmId: DEMO_FARM_ID,
        name: spec.name,
        sensorType: spec.sensorType,
        serialNumber: `SN-${spec.id.toUpperCase()}`,
        positionX: spec.positionX,
        positionZ: spec.positionZ,
        assignedPlotId: spec.assignedPlotId,
        communicationType: "radio",
        batteryCapacityMah: 3400,
        samplingIntervalSeconds: 60,
        gateway: "Gateway 1",
        firmwareVersion: "1.2.0",
        installedAt: now,
        notes: "",
        batteryPowered: true,
        gatewayConnected: true,
        status: "online",
        health: "nominal",
        batteryPercent: 100,
        signalPercent: 96,
        currentReading: spec.reading,
        previousReading: spec.reading,
        readingHistory: [spec.reading],
        lastReadingAt: now,
        lastUpdatedAt: now,
      },
    });
  }

  const isolationSensor = await prisma.sensor.upsert({
    where: { id: "sensor-isolation-test" },
    update: {},
    create: {
      id: "sensor-isolation-test",
      farmId: ISOLATION_FARM_ID,
      name: "Isolation Test Sensor",
      sensorType: "soil_moisture",
      serialNumber: "SN-ISOLATION-TEST",
      positionX: 0,
      positionZ: 0,
      assignedPlotId: null,
      communicationType: "radio",
      batteryCapacityMah: 3400,
      samplingIntervalSeconds: 60,
      gateway: "Gateway 1",
      firmwareVersion: "1.2.0",
      installedAt: now,
      notes: "",
      batteryPowered: true,
      gatewayConnected: true,
      status: "online",
      health: "nominal",
      batteryPercent: 12,
      signalPercent: 80,
      currentReading: 15,
      previousReading: 15,
      readingHistory: [15],
      lastReadingAt: now,
      lastUpdatedAt: now,
    },
  });

  // Deterministic upsert (not findFirst-then-create) — a fixed id keeps this
  // rerunnable like every other seeded entity, rather than relying on a
  // "does this farm already have any alert" existence check.
  await prisma.alert.upsert({
    where: { id: "alert-isolation-test" },
    update: {},
    create: {
      id: "alert-isolation-test",
      farmId: ISOLATION_FARM_ID,
      sensorId: isolationSensor.id,
      sensorName: isolationSensor.name,
      alertType: "low_battery",
      severity: "warning",
      message: "This alert and sensor belong to a different farm and must never be visible to AgriNexus Demo Farm sessions.",
      value: 12,
    },
  });

  console.log("Seeded", demoSensors.length, "demo sensors and 1 isolation-test sensor+alert.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
