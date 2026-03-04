-- CreateTable
CREATE TABLE "Dispute" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userAddress" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" JSONB,
    "status" TEXT NOT NULL,
    "resolution" TEXT,
    "refundAmount" DECIMAL(12, 2),
    "reviewerRole" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Dispute_orderId_key" ON "Dispute"("orderId");

-- CreateIndex
CREATE INDEX "Dispute_userAddress_createdAt_idx" ON "Dispute"("userAddress", "createdAt");

-- CreateIndex
CREATE INDEX "Dispute_status_idx" ON "Dispute"("status");

-- CreateIndex
CREATE INDEX "Dispute_createdAt_idx" ON "Dispute"("createdAt");

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "AdminOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill legacy meta.dispute data
INSERT INTO "Dispute" (
    "id",
    "orderId",
    "userAddress",
    "reason",
    "description",
    "evidence",
    "status",
    "resolution",
    "refundAmount",
    "reviewerRole",
    "createdAt",
    "updatedAt",
    "resolvedAt"
)
SELECT
    COALESCE(NULLIF(meta->'dispute'->>'id', ''), CONCAT('DSP-LEGACY-', "id")) AS "id",
    "id" AS "orderId",
    COALESCE(NULLIF(meta->'dispute'->>'userAddress', ''), COALESCE("userAddress", '')) AS "userAddress",
    COALESCE(NULLIF(meta->'dispute'->>'reason', ''), 'other') AS "reason",
    COALESCE(NULLIF(meta->'dispute'->>'description', ''), '') AS "description",
    meta->'dispute'->'evidence' AS "evidence",
    COALESCE(NULLIF(meta->'dispute'->>'status', ''), 'pending') AS "status",
    NULLIF(meta->'dispute'->>'resolution', '') AS "resolution",
    CASE
        WHEN NULLIF(meta->'dispute'->>'refundAmount', '') IS NOT NULL
        THEN (meta->'dispute'->>'refundAmount')::DECIMAL(12,2)
        ELSE NULL
    END AS "refundAmount",
    NULLIF(meta->'dispute'->>'reviewerRole', '') AS "reviewerRole",
    COALESCE(
      CASE
        WHEN NULLIF(meta->'dispute'->>'createdAt', '') IS NOT NULL
        THEN (meta->'dispute'->>'createdAt')::TIMESTAMPTZ::TIMESTAMP
        ELSE NULL
      END,
      "createdAt"
    ) AS "createdAt",
    "updatedAt" AS "updatedAt",
    CASE
      WHEN NULLIF(meta->'dispute'->>'resolvedAt', '') IS NOT NULL
      THEN (meta->'dispute'->>'resolvedAt')::TIMESTAMPTZ::TIMESTAMP
      ELSE NULL
    END AS "resolvedAt"
FROM "AdminOrder"
WHERE meta IS NOT NULL
  AND meta ? 'dispute'
ON CONFLICT ("orderId") DO NOTHING;
