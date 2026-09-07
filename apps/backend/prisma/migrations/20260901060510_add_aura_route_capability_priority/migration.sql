-- CreateTable
CREATE TABLE "AuraRouteCapabilityPriority" (
    "id" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuraRouteCapabilityPriority_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuraRouteCapabilityPriority_capability_priority_idx" ON "AuraRouteCapabilityPriority"("capability", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "AuraRouteCapabilityPriority_endpointId_capability_key" ON "AuraRouteCapabilityPriority"("endpointId", "capability");

-- AddForeignKey
ALTER TABLE "AuraRouteCapabilityPriority" ADD CONSTRAINT "AuraRouteCapabilityPriority_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "AuraRouteEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
