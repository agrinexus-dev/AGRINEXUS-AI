-- AlterTable
ALTER TABLE "Farm" ADD COLUMN     "droneAutonomousEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "robotAutonomousEnabled" BOOLEAN NOT NULL DEFAULT false;
