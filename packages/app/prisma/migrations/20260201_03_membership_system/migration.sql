-- CreateTable
CREATE TABLE "AdminMembershipTier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "badge" TEXT,
    "price" DOUBLE PRECISION,
    "durationDays" INTEGER,
    "minPoints" INTEGER,
    "status" TEXT NOT NULL,
    "perks" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "AdminMembershipTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminMember" (
    "id" TEXT NOT NULL,
    "userAddress" TEXT,
    "userName" TEXT,
    "tierId" TEXT,
    "tierName" TEXT,
    "points" INTEGER,
    "status" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "AdminMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminMembershipRequest" (
    "id" TEXT NOT NULL,
    "userAddress" TEXT,
    "userName" TEXT,
    "contact" TEXT,
    "tierId" TEXT,
    "tierName" TEXT,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "AdminMembershipRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminMembershipTier_status_idx" ON "AdminMembershipTier"("status");

-- CreateIndex
CREATE INDEX "AdminMembershipTier_level_idx" ON "AdminMembershipTier"("level");

-- CreateIndex
CREATE INDEX "AdminMember_status_idx" ON "AdminMember"("status");

-- CreateIndex
CREATE INDEX "AdminMember_tierId_idx" ON "AdminMember"("tierId");

-- CreateIndex
CREATE INDEX "AdminMember_userAddress_idx" ON "AdminMember"("userAddress");

-- CreateIndex
CREATE INDEX "AdminMembershipRequest_status_idx" ON "AdminMembershipRequest"("status");

-- CreateIndex
CREATE INDEX "AdminMembershipRequest_tierId_idx" ON "AdminMembershipRequest"("tierId");
