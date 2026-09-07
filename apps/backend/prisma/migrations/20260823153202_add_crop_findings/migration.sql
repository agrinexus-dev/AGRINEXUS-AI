-- CreateEnum
CREATE TYPE "CropIssueType" AS ENUM ('dry-soil', 'nutrient-deficiency', 'weed-growth', 'pest-activity', 'fungal-risk', 'standing-water', 'crop-stress', 'damaged-crop-area');

-- CreateEnum
CREATE TYPE "CropIssueSeverity" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "CropFindingStatus" AS ENUM ('detected', 'resolved', 'requires-human-action');

-- CreateEnum
CREATE TYPE "CropFindingDetectionMethod" AS ENUM ('drone', 'robot');

-- CreateTable
CREATE TABLE "CropFinding" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "plotId" TEXT NOT NULL,
    "issueType" "CropIssueType" NOT NULL,
    "severity" "CropIssueSeverity" NOT NULL,
    "positionX" DOUBLE PRECISION NOT NULL,
    "positionZ" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "status" "CropFindingStatus" NOT NULL,
    "detectionMethod" "CropFindingDetectionMethod" NOT NULL,
    "detectedByDroneMissionId" TEXT,
    "detectedByRobotMissionId" TEXT,
    "correctiveActionType" TEXT,
    "correctiveActionDescription" TEXT,
    "resolvedByRobotMissionId" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "CropFinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CropFinding_farmId_idx" ON "CropFinding"("farmId");

-- CreateIndex
CREATE INDEX "CropFinding_plotId_idx" ON "CropFinding"("plotId");

-- CreateIndex
CREATE INDEX "CropFinding_detectedByDroneMissionId_idx" ON "CropFinding"("detectedByDroneMissionId");

-- CreateIndex
CREATE INDEX "CropFinding_detectedByRobotMissionId_idx" ON "CropFinding"("detectedByRobotMissionId");

-- AddForeignKey
ALTER TABLE "CropFinding" ADD CONSTRAINT "CropFinding_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CropFinding" ADD CONSTRAINT "CropFinding_plotId_fkey" FOREIGN KEY ("plotId") REFERENCES "Plot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CropFinding" ADD CONSTRAINT "CropFinding_detectedByDroneMissionId_fkey" FOREIGN KEY ("detectedByDroneMissionId") REFERENCES "DroneMission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CropFinding" ADD CONSTRAINT "CropFinding_detectedByRobotMissionId_fkey" FOREIGN KEY ("detectedByRobotMissionId") REFERENCES "RobotMission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CropFinding" ADD CONSTRAINT "CropFinding_resolvedByRobotMissionId_fkey" FOREIGN KEY ("resolvedByRobotMissionId") REFERENCES "RobotMission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
