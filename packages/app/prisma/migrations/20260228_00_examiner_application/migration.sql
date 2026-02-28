-- CreateTable
CREATE TABLE "AdminExaminerApplication" (
    "id" TEXT NOT NULL,
    "user" TEXT,
    "userAddress" TEXT,
    "contact" TEXT,
    "games" TEXT,
    "rank" TEXT,
    "liveTime" TEXT,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AdminExaminerApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminExaminerApplication_createdAt_idx" ON "AdminExaminerApplication"("createdAt");

-- CreateIndex
CREATE INDEX "AdminExaminerApplication_status_idx" ON "AdminExaminerApplication"("status");

-- CreateIndex
CREATE INDEX "AdminExaminerApplication_userAddress_idx" ON "AdminExaminerApplication"("userAddress");

-- CreateIndex
CREATE INDEX "AdminExaminerApplication_deletedAt_idx" ON "AdminExaminerApplication"("deletedAt");
