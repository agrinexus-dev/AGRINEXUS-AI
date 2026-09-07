-- CreateEnum
CREATE TYPE "CropGrowthStage" AS ENUM ('seedling', 'growing', 'mature', 'fallow');

-- CreateTable
CREATE TABLE "Plot" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "centerX" DOUBLE PRECISION NOT NULL,
    "centerZ" DOUBLE PRECISION NOT NULL,
    "sizeWidth" DOUBLE PRECISION NOT NULL,
    "sizeDepth" DOUBLE PRECISION NOT NULL,
    "growthStage" "CropGrowthStage" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Plot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Plot_farmId_idx" ON "Plot"("farmId");

-- CreateIndex
CREATE INDEX "Sensor_assignedPlotId_idx" ON "Sensor"("assignedPlotId");

-- AddForeignKey
ALTER TABLE "Plot" ADD CONSTRAINT "Plot_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sensor" ADD CONSTRAINT "Sensor_assignedPlotId_fkey" FOREIGN KEY ("assignedPlotId") REFERENCES "Plot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
