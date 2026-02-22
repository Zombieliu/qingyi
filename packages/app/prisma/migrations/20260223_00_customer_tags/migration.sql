-- CreateTable
CREATE TABLE "CustomerTag" (
    "id" TEXT NOT NULL,
    "userAddress" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "note" TEXT,
    "severity" INTEGER NOT NULL DEFAULT 1,
    "reportedBy" TEXT NOT NULL,
    "reportedByRole" TEXT NOT NULL DEFAULT 'companion',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerTag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerTag_userAddress_active_idx" ON "CustomerTag"("userAddress", "active");

-- CreateIndex
CREATE INDEX "CustomerTag_reportedBy_idx" ON "CustomerTag"("reportedBy");
