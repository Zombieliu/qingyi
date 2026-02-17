-- CreateTable
CREATE TABLE "ChainEventCursor" (
    "id" TEXT NOT NULL,
    "cursor" JSONB,
    "lastEventAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "ChainEventCursor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChainEventCursor_createdAt_idx" ON "ChainEventCursor"("createdAt");
