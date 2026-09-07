-- CreateEnum
CREATE TYPE "SensorType" AS ENUM ('soil-moisture', 'soil-temperature', 'air-temperature', 'humidity', 'ph', 'ec', 'nitrogen', 'phosphorus', 'potassium', 'rain-gauge', 'wind-speed', 'wind-direction', 'solar-radiation', 'light-intensity', 'leaf-wetness', 'water-tank-level', 'flow-meter', 'weather-station');

-- CreateEnum
CREATE TYPE "SensorStatus" AS ENUM ('online', 'offline', 'warning', 'critical', 'maintenance');

-- CreateEnum
CREATE TYPE "SensorHealth" AS ENUM ('nominal', 'attention', 'critical');

-- CreateEnum
CREATE TYPE "CommunicationType" AS ENUM ('wifi', 'radio', 'cellular', 'satellite');

-- AlterTable
ALTER TABLE "Alert" ALTER COLUMN "sensorId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Sensor" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sensorType" "SensorType" NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "positionX" DOUBLE PRECISION NOT NULL,
    "positionZ" DOUBLE PRECISION NOT NULL,
    "assignedPlotId" TEXT,
    "communicationType" "CommunicationType" NOT NULL,
    "batteryCapacityMah" INTEGER NOT NULL,
    "samplingIntervalSeconds" INTEGER NOT NULL,
    "gateway" TEXT NOT NULL,
    "firmwareVersion" TEXT NOT NULL,
    "installedAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT NOT NULL,
    "batteryPowered" BOOLEAN NOT NULL,
    "gatewayConnected" BOOLEAN NOT NULL,
    "status" "SensorStatus" NOT NULL,
    "health" "SensorHealth" NOT NULL,
    "batteryPercent" DOUBLE PRECISION NOT NULL,
    "signalPercent" INTEGER NOT NULL,
    "currentReading" DOUBLE PRECISION NOT NULL,
    "previousReading" DOUBLE PRECISION NOT NULL,
    "readingHistory" JSONB NOT NULL,
    "lastReadingAt" TIMESTAMP(3) NOT NULL,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sensor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Sensor_farmId_idx" ON "Sensor"("farmId");

-- CreateIndex
CREATE INDEX "Alert_sensorId_idx" ON "Alert"("sensorId");

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_sensorId_fkey" FOREIGN KEY ("sensorId") REFERENCES "Sensor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sensor" ADD CONSTRAINT "Sensor_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
