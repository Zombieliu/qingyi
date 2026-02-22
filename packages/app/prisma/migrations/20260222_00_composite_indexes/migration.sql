-- Composite indexes for query performance
-- Public orders cursor query (companionAddress IS NULL + ORDER BY createdAt, id)
CREATE INDEX IF NOT EXISTS "AdminOrder_companionAddress_createdAt_id_idx" ON "AdminOrder"("companionAddress", "createdAt", "id");

-- User order history (userAddress + ORDER BY createdAt)
CREATE INDEX IF NOT EXISTS "AdminOrder_userAddress_createdAt_idx" ON "AdminOrder"("userAddress", "createdAt");
