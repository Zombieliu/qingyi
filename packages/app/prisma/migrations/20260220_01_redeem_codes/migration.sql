-- CreateTable
CREATE TABLE "RedeemBatch" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "rewardType" TEXT NOT NULL,
    "rewardPayload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'active',
    "maxRedeem" INTEGER,
    "maxRedeemPerUser" INTEGER,
    "totalCodes" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "RedeemBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RedeemCode" (
    "id" TEXT NOT NULL,
    "batchId" TEXT,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "maxRedeem" INTEGER NOT NULL DEFAULT 1,
    "maxRedeemPerUser" INTEGER NOT NULL DEFAULT 1,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "rewardType" TEXT,
    "rewardPayload" JSONB,
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3),
    "lastRedeemedAt" TIMESTAMP(3),

    CONSTRAINT "RedeemCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RedeemRecord" (
    "id" TEXT NOT NULL,
    "codeId" TEXT NOT NULL,
    "batchId" TEXT,
    "userAddress" TEXT NOT NULL,
    "rewardType" TEXT NOT NULL,
    "rewardPayload" JSONB,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "meta" JSONB,

    CONSTRAINT "RedeemRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RedeemBatch_status_idx" ON "RedeemBatch"("status");

-- CreateIndex
CREATE INDEX "RedeemBatch_createdAt_idx" ON "RedeemBatch"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RedeemCode_code_key" ON "RedeemCode"("code");

-- CreateIndex
CREATE INDEX "RedeemCode_batchId_idx" ON "RedeemCode"("batchId");

-- CreateIndex
CREATE INDEX "RedeemCode_status_idx" ON "RedeemCode"("status");

-- CreateIndex
CREATE INDEX "RedeemCode_createdAt_idx" ON "RedeemCode"("createdAt");

-- CreateIndex
CREATE INDEX "RedeemRecord_userAddress_createdAt_idx" ON "RedeemRecord"("userAddress", "createdAt");

-- CreateIndex
CREATE INDEX "RedeemRecord_batchId_idx" ON "RedeemRecord"("batchId");

-- CreateIndex
CREATE INDEX "RedeemRecord_codeId_idx" ON "RedeemRecord"("codeId");

-- AddForeignKey
ALTER TABLE "RedeemCode" ADD CONSTRAINT "RedeemCode_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "RedeemBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedeemRecord" ADD CONSTRAINT "RedeemRecord_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "RedeemCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedeemRecord" ADD CONSTRAINT "RedeemRecord_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "RedeemBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
