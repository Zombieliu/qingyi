-- CreateTable
CREATE TABLE "DuoOrder" (
    "id" TEXT NOT NULL,
    "user" TEXT NOT NULL,
    "userAddress" TEXT,
    "companionAddressA" TEXT,
    "companionAddressB" TEXT,
    "item" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "paymentStatus" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "note" TEXT,
    "assignedTo" TEXT,
    "source" TEXT,
    "chainDigest" TEXT,
    "chainStatus" INTEGER,
    "serviceFee" DECIMAL(12,2),
    "depositPerCompanion" DECIMAL(12,2),
    "teamStatus" INTEGER DEFAULT 0,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "DuoOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DuoOrder_createdAt_idx" ON "DuoOrder"("createdAt");
CREATE INDEX "DuoOrder_stage_idx" ON "DuoOrder"("stage");
CREATE INDEX "DuoOrder_userAddress_idx" ON "DuoOrder"("userAddress");
CREATE INDEX "DuoOrder_companionAddressA_idx" ON "DuoOrder"("companionAddressA");
CREATE INDEX "DuoOrder_companionAddressB_idx" ON "DuoOrder"("companionAddressB");
CREATE INDEX "DuoOrder_teamStatus_idx" ON "DuoOrder"("teamStatus");
CREATE INDEX "DuoOrder_deletedAt_idx" ON "DuoOrder"("deletedAt");
