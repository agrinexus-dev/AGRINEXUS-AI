-- CreateEnum
CREATE TYPE "AuraMessageRole" AS ENUM ('user', 'assistant');

-- CreateTable
CREATE TABLE "AuraConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuraConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuraMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "AuraMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuraMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuraConversation_userId_farmId_updatedAt_idx" ON "AuraConversation"("userId", "farmId", "updatedAt");

-- CreateIndex
CREATE INDEX "AuraMessage_conversationId_createdAt_idx" ON "AuraMessage"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "AuraConversation" ADD CONSTRAINT "AuraConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuraConversation" ADD CONSTRAINT "AuraConversation_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuraMessage" ADD CONSTRAINT "AuraMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AuraConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
