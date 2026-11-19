-- AlterTable
ALTER TABLE "sales" ADD COLUMN "idempotency_key" VARCHAR(100);

-- CreateIndex
CREATE UNIQUE INDEX "sales_outlet_id_idempotency_key_key" ON "sales"("outlet_id", "idempotency_key");
