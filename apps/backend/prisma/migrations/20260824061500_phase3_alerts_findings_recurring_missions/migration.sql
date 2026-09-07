-- CreateEnum
CREATE TYPE "RecurringVehicleKind" AS ENUM ('drone', 'robot');
-- AlterEnum
ALTER TYPE "AlertType" ADD VALUE 'crop-finding';
-- AlterTable
ALTER TABLE "Alert" ADD COLUMN     "findingId" TEXT,
ALTER COLUMN "value" DROP NOT NULL;
-- AlterTable
ALTER TABLE "DroneMission" ADD COLUMN     "recurringConfigId" TEXT;
-- AlterTable
ALTER TABLE "RobotMission" ADD COLUMN     "recurringConfigId" TEXT;
-- CreateTable
CREATE TABLE "RecurringMissionConfig" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vehicleKind" "RecurringVehicleKind" NOT NULL,
    "droneMissionType" "DroneMissionType",
    "robotMissionType" "RobotMissionType",
    "targetPlotId" TEXT,
    "assignedDroneId" TEXT,
    "assignedRobotId" TEXT,
    "intervalMinutes" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "nextRunAt" TIMESTAMP(3),
    "activeRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecurringMissionConfig_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "RecurringMissionConfig_farmId_idx" ON "RecurringMissionConfig"("farmId");
-- CreateIndex
CREATE INDEX "RecurringMissionConfig_assignedDroneId_idx" ON "RecurringMissionConfig"("assignedDroneId");
-- CreateIndex
CREATE INDEX "RecurringMissionConfig_assignedRobotId_idx" ON "RecurringMissionConfig"("assignedRobotId");
-- CreateIndex
CREATE UNIQUE INDEX "Alert_findingId_key" ON "Alert"("findingId");
-- CreateIndex
CREATE INDEX "DroneMission_recurringConfigId_idx" ON "DroneMission"("recurringConfigId");
-- CreateIndex
CREATE INDEX "RobotMission_recurringConfigId_idx" ON "RobotMission"("recurringConfigId");
-- AddForeignKey
ALTER TABLE "DroneMission" ADD CONSTRAINT "DroneMission_recurringConfigId_fkey" FOREIGN KEY ("recurringConfigId") REFERENCES "RecurringMissionConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "RobotMission" ADD CONSTRAINT "RobotMission_recurringConfigId_fkey" FOREIGN KEY ("recurringConfigId") REFERENCES "RecurringMissionConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "RecurringMissionConfig" ADD CONSTRAINT "RecurringMissionConfig_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "RecurringMissionConfig" ADD CONSTRAINT "RecurringMissionConfig_targetPlotId_fkey" FOREIGN KEY ("targetPlotId") REFERENCES "Plot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "RecurringMissionConfig" ADD CONSTRAINT "RecurringMissionConfig_assignedDroneId_fkey" FOREIGN KEY ("assignedDroneId") REFERENCES "Drone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "RecurringMissionConfig" ADD CONSTRAINT "RecurringMissionConfig_assignedRobotId_fkey" FOREIGN KEY ("assignedRobotId") REFERENCES "Robot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "CropFinding"("id") ON DELETE SET NULL ON UPDATE CASCADE;
