-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('RESTOCK', 'ADJUSTMENT', 'SALE');

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "outlet_menu_item_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "movement_type" "StockMovementType" NOT NULL,
    "quantity_before" INTEGER NOT NULL,
    "quantity_change" INTEGER NOT NULL,
    "quantity_after" INTEGER NOT NULL,
    "actor_user_id" UUID,
    "sale_id" UUID,
    "note" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_movements_outlet_id_created_at_idx" ON "stock_movements"("outlet_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_movements_outlet_menu_item_id_created_at_idx" ON "stock_movements"("outlet_menu_item_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_movements_sale_id_idx" ON "stock_movements"("sale_id");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_outlet_menu_item_id_fkey" FOREIGN KEY ("outlet_menu_item_id") REFERENCES "outlet_menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddCheckConstraints
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_quantity_before_check" CHECK ("quantity_before" >= 0);
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_quantity_change_check" CHECK ("quantity_change" <> 0);
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_quantity_after_check" CHECK ("quantity_after" >= 0);
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_quantity_math_check" CHECK ("quantity_after" = "quantity_before" + "quantity_change");
