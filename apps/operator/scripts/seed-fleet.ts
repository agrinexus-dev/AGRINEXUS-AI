/**
 * One-time dev seed for the Drone/Robot/Mission vertical slice (Prompt
 * 018E) — NOT part of any app's runtime, run manually:
 * `npx tsx scripts/seed-fleet.ts` from apps/operator (needs `DATABASE_URL`
 * set, and `seed-alerts.ts`/`seed-plots.ts` already run so the demo/
 * isolation Users, Farms, and Plots exist).
 *
 * Seeds Drone Alpha and Robot Bravo — the SAME identity/spec values
 * `fleet-store.ts`'s `seedDroneAlpha()`/`robot-store.ts`'s `seedRobotBravo()`
 * hardcode client-side (verbatim, never silently altered) — onto the real
 * "AgriNexus Demo Farm", so `fetchDrones()`/`fetchRobots()`'s merge-by-id
 * logic (see those stores' own doc comments) recognizes them as the SAME
 * unit rather than showing a duplicate. No missions are seeded here — the
 * app has never had any missions pre-exist before a user creates one (the
 * Mission Store always starts with `order: []`), so seeding a fake one
 * would be dishonest demo data with no real client-side counterpart.
 *
 * Also seeds one Drone + one Robot on the isolated "Isolation Test Farm",
 * purely for the cross-farm security tests.
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
  await prisma.drone.upsert({
    where: { id: "drone-alpha" },
    update: {},
    create: {
      id: "drone-alpha",
      farmId: DEMO_FARM_ID,
      name: "Drone Alpha",
      model: "AgriNexus AX-100",
      serialNumber: "AX100-0001",
      droneType: "quadcopter",
      cameraType: "rgb_thermal",
      batteryCapacityMah: 5200,
      maxFlightTimeMinutes: 28,
      communicationType: "radio",
      firmwareVersion: "2.4.1",
      homeLocationX: -20,
      homeLocationZ: -20,
      color: "#4fd1c5",
      notes: "Perimeter patrol unit — the Digital Twin's original drone.",
    },
  });

  await prisma.robot.upsert({
    where: { id: "robot-bravo" },
    update: {},
    create: {
      id: "robot-bravo",
      farmId: DEMO_FARM_ID,
      name: "Robot Bravo",
      model: "AgriNexus GX-200",
      manufacturer: "AgriNexus Robotics",
      robotType: "wheeled",
      color: "#f6ad55",
      maxSpeedMps: 2.2,
      batteryCapacityMah: 12000,
      maxRuntimeMinutes: 180,
      communicationType: "wifi",
      homePositionX: 24,
      homePositionZ: 8,
      notes: "Original yard & field ground unit — the Digital Twin's first autonomous rover.",
      capabilities: { camera: true, lidar: true, sprayer: false, seeder: false, fertilizer: false, aiEnabled: true },
    },
  });

  const isolationDrone = await prisma.drone.upsert({
    where: { id: "drone-isolation-test" },
    update: {},
    create: {
      id: "drone-isolation-test",
      farmId: ISOLATION_FARM_ID,
      name: "Isolation Test Drone",
      model: "Test Model",
      serialNumber: "TEST-0001",
      droneType: "quadcopter",
      cameraType: "rgb",
      batteryCapacityMah: 4000,
      maxFlightTimeMinutes: 20,
      communicationType: "wifi",
      firmwareVersion: "1.0.0",
      homeLocationX: 0,
      homeLocationZ: 0,
      color: "#888888",
      notes: "",
    },
  });

  const isolationRobot = await prisma.robot.upsert({
    where: { id: "robot-isolation-test" },
    update: {},
    create: {
      id: "robot-isolation-test",
      farmId: ISOLATION_FARM_ID,
      name: "Isolation Test Robot",
      model: "Test Model",
      manufacturer: "Test",
      robotType: "wheeled",
      color: "#888888",
      maxSpeedMps: 1.5,
      batteryCapacityMah: 8000,
      maxRuntimeMinutes: 120,
      communicationType: "wifi",
      homePositionX: 0,
      homePositionZ: 0,
      notes: "",
      capabilities: { camera: false, lidar: false, sprayer: false, seeder: false, fertilizer: false, aiEnabled: false },
    },
  });

  const isolationMission = await prisma.droneMission.upsert({
    where: { id: "mission-isolation-test" },
    update: {},
    create: {
      id: "mission-isolation-test",
      farmId: ISOLATION_FARM_ID,
      name: "Isolation Test Mission",
      missionType: "survey",
      targetPlotId: "plot-isolation-test",
      assignedDroneId: "drone-isolation-test",
      status: "queued",
      altitude: 12,
      speedMps: 4,
      sideOverlapPercent: 70,
      frontOverlapPercent: 75,
      waypoints: [],
      progressPercent: 0,
      coverageProgressPercent: 0,
      currentWaypointIndex: 0,
    },
  });

  const isolationRobotMission = await prisma.robotMission.upsert({
    where: { id: "robot-mission-isolation-test" },
    update: {},
    create: {
      id: "robot-mission-isolation-test",
      farmId: ISOLATION_FARM_ID,
      name: "Isolation Test Robot Mission",
      missionType: "crop_inspection",
      targetPlotId: "plot-isolation-test",
      assignedRobotId: "robot-isolation-test",
      status: "queued",
      speedMps: 1.8,
      pathSpacingPercent: 65,
      waypoints: [],
      progressPercent: 0,
      coverageProgressPercent: 0,
      currentWaypointIndex: 0,
    },
  });

  console.log("Seeded Drone Alpha, Robot Bravo, and isolation-test records:", {
    isolationDrone: isolationDrone.id,
    isolationRobot: isolationRobot.id,
    isolationMission: isolationMission.id,
    isolationRobotMission: isolationRobotMission.id,
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
