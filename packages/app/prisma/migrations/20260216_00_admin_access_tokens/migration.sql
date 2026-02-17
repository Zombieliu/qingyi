-- CreateTable
CREATE TABLE "AdminAccessToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "label" TEXT,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "AdminAccessToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminAccessToken_tokenHash_key" ON "AdminAccessToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AdminAccessToken_status_idx" ON "AdminAccessToken"("status");

-- CreateIndex
CREATE INDEX "AdminAccessToken_role_idx" ON "AdminAccessToken"("role");

-- CreateIndex
CREATE INDEX "AdminAccessToken_createdAt_idx" ON "AdminAccessToken"("createdAt");
