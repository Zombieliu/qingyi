-- CreateTable
CREATE TABLE "AdminLiveApplication" (
    "id" TEXT NOT NULL,
    "user" TEXT,
    "userAddress" TEXT,
    "contact" TEXT,
    "platform" TEXT,
    "liveUrl" TEXT,
    "games" TEXT,
    "liveTime" TEXT,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AdminLiveApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminLiveApplication_createdAt_idx" ON "AdminLiveApplication"("createdAt");

-- CreateIndex
CREATE INDEX "AdminLiveApplication_status_idx" ON "AdminLiveApplication"("status");

-- CreateIndex
CREATE INDEX "AdminLiveApplication_userAddress_idx" ON "AdminLiveApplication"("userAddress");

-- CreateIndex
CREATE INDEX "AdminLiveApplication_deletedAt_idx" ON "AdminLiveApplication"("deletedAt");
