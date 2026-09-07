-- CreateTable
CREATE TABLE "AuraRouteEndpoint" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "credentialEnv" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "capabilities" TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuraRouteEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuraRouteEndpoint_priority_idx" ON "AuraRouteEndpoint"("priority");

-- CreateIndex
CREATE UNIQUE INDEX "AuraRouteEndpoint_provider_credentialEnv_model_key" ON "AuraRouteEndpoint"("provider", "credentialEnv", "model");
