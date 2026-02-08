-- CreateTable
CREATE TABLE "GrowthEvent" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "clientId" TEXT,
    "sessionId" TEXT,
    "userAddress" TEXT,
    "path" TEXT,
    "referrer" TEXT,
    "ua" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrowthEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GrowthEvent_createdAt_idx" ON "GrowthEvent"("createdAt");

-- CreateIndex
CREATE INDEX "GrowthEvent_event_idx" ON "GrowthEvent"("event");

-- CreateIndex
CREATE INDEX "GrowthEvent_userAddress_idx" ON "GrowthEvent"("userAddress");

-- CreateIndex
CREATE INDEX "GrowthEvent_clientId_idx" ON "GrowthEvent"("clientId");
