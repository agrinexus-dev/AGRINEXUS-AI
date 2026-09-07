-- CreateEnum
CREATE TYPE "DroneType" AS ENUM ('quadcopter', 'hexacopter', 'octocopter', 'fixed-wing', 'vtol');

-- CreateEnum
CREATE TYPE "CameraType" AS ENUM ('rgb', 'thermal', 'multispectral', 'rgb-thermal', 'none');

-- CreateEnum
CREATE TYPE "RobotType" AS ENUM ('wheeled', 'tracked', 'quadruped', 'utility');

-- CreateEnum
CREATE TYPE "DroneMissionType" AS ENUM ('survey', 'crop-health', 'disease-scan', 'thermal-scan', 'ndvi', 'rgb-capture', 'irrigation-inspection', 'emergency-inspection', 'manual');

-- CreateEnum
CREATE TYPE "DroneMissionStatus" AS ENUM ('queued', 'preparing', 'taking-off', 'surveying', 'returning', 'landing', 'completed', 'paused', 'cancelled');

-- CreateEnum
CREATE TYPE "RobotMissionType" AS ENUM ('crop-inspection', 'weed-detection', 'targeted-spraying', 'precision-fertilization', 'soil-sampling', 'seed-planting', 'ground-imaging', 'autonomous-patrol', 'manual-drive');

-- CreateEnum
CREATE TYPE "RobotMissionStatus" AS ENUM ('queued', 'preparing', 'driving', 'working', 'returning', 'completed', 'paused', 'cancelled');

-- CreateTable
CREATE TABLE "Drone" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "droneType" "DroneType" NOT NULL,
    "cameraType" "CameraType" NOT NULL,
    "batteryCapacityMah" INTEGER NOT NULL,
    "maxFlightTimeMinutes" INTEGER NOT NULL,
    "communicationType" "CommunicationType" NOT NULL,
    "firmwareVersion" TEXT NOT NULL,
    "homeLocationX" DOUBLE PRECISION NOT NULL,
    "homeLocationZ" DOUBLE PRECISION NOT NULL,
    "color" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Drone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Robot" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "robotType" "RobotType" NOT NULL,
    "color" TEXT NOT NULL,
    "maxSpeedMps" DOUBLE PRECISION NOT NULL,
    "batteryCapacityMah" INTEGER NOT NULL,
    "maxRuntimeMinutes" INTEGER NOT NULL,
    "communicationType" "CommunicationType" NOT NULL,
    "homePositionX" DOUBLE PRECISION NOT NULL,
    "homePositionZ" DOUBLE PRECISION NOT NULL,
    "notes" TEXT NOT NULL,
    "capabilities" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Robot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DroneMission" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "missionType" "DroneMissionType" NOT NULL,
    "targetPlotId" TEXT,
    "assignedDroneId" TEXT,
    "status" "DroneMissionStatus" NOT NULL,
    "altitude" DOUBLE PRECISION NOT NULL,
    "speedMps" DOUBLE PRECISION NOT NULL,
    "sideOverlapPercent" DOUBLE PRECISION NOT NULL,
    "frontOverlapPercent" DOUBLE PRECISION NOT NULL,
    "homePositionX" DOUBLE PRECISION,
    "homePositionZ" DOUBLE PRECISION,
    "takeoffPositionX" DOUBLE PRECISION,
    "takeoffPositionZ" DOUBLE PRECISION,
    "landingPositionX" DOUBLE PRECISION,
    "landingPositionZ" DOUBLE PRECISION,
    "waypoints" JSONB NOT NULL,
    "estimate" JSONB,
    "progressPercent" DOUBLE PRECISION NOT NULL,
    "coverageProgressPercent" DOUBLE PRECISION NOT NULL,
    "currentWaypointIndex" INTEGER NOT NULL,
    "headingDegrees" DOUBLE PRECISION,
    "batteryAtStartPercent" DOUBLE PRECISION,
    "sensorJustification" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "DroneMission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RobotMission" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "missionType" "RobotMissionType" NOT NULL,
    "targetPlotId" TEXT,
    "assignedRobotId" TEXT,
    "status" "RobotMissionStatus" NOT NULL,
    "speedMps" DOUBLE PRECISION NOT NULL,
    "pathSpacingPercent" DOUBLE PRECISION NOT NULL,
    "homePositionX" DOUBLE PRECISION,
    "homePositionZ" DOUBLE PRECISION,
    "startPositionX" DOUBLE PRECISION,
    "startPositionZ" DOUBLE PRECISION,
    "returnPositionX" DOUBLE PRECISION,
    "returnPositionZ" DOUBLE PRECISION,
    "waypoints" JSONB NOT NULL,
    "estimate" JSONB,
    "progressPercent" DOUBLE PRECISION NOT NULL,
    "coverageProgressPercent" DOUBLE PRECISION NOT NULL,
    "currentWaypointIndex" INTEGER NOT NULL,
    "headingDegrees" DOUBLE PRECISION,
    "batteryAtStartPercent" DOUBLE PRECISION,
    "sensorJustification" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "RobotMission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Drone_farmId_idx" ON "Drone"("farmId");

-- CreateIndex
CREATE INDEX "Robot_farmId_idx" ON "Robot"("farmId");

-- CreateIndex
CREATE INDEX "DroneMission_farmId_idx" ON "DroneMission"("farmId");

-- CreateIndex
CREATE INDEX "DroneMission_targetPlotId_idx" ON "DroneMission"("targetPlotId");

-- CreateIndex
CREATE INDEX "DroneMission_assignedDroneId_idx" ON "DroneMission"("assignedDroneId");

-- CreateIndex
CREATE INDEX "RobotMission_farmId_idx" ON "RobotMission"("farmId");

-- CreateIndex
CREATE INDEX "RobotMission_targetPlotId_idx" ON "RobotMission"("targetPlotId");

-- CreateIndex
CREATE INDEX "RobotMission_assignedRobotId_idx" ON "RobotMission"("assignedRobotId");

-- AddForeignKey
ALTER TABLE "Drone" ADD CONSTRAINT "Drone_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Robot" ADD CONSTRAINT "Robot_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DroneMission" ADD CONSTRAINT "DroneMission_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DroneMission" ADD CONSTRAINT "DroneMission_targetPlotId_fkey" FOREIGN KEY ("targetPlotId") REFERENCES "Plot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DroneMission" ADD CONSTRAINT "DroneMission_assignedDroneId_fkey" FOREIGN KEY ("assignedDroneId") REFERENCES "Drone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RobotMission" ADD CONSTRAINT "RobotMission_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RobotMission" ADD CONSTRAINT "RobotMission_targetPlotId_fkey" FOREIGN KEY ("targetPlotId") REFERENCES "Plot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RobotMission" ADD CONSTRAINT "RobotMission_assignedRobotId_fkey" FOREIGN KEY ("assignedRobotId") REFERENCES "Robot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
