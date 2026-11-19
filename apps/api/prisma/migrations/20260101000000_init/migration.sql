-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('HQ_ADMIN', 'OUTLET_STAFF');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "full_name" VARCHAR(150) NOT NULL,
    "role" "Role" NOT NULL,
    "outlet_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outlets" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "address" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "outlets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" UUID NOT NULL,
    "sku" VARCHAR(50) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outlet_menu_items" (
    "id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "menu_item_id" UUID NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "outlet_menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outlet_inventory" (
    "id" UUID NOT NULL,
    "outlet_menu_item_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "low_stock_threshold" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "outlet_inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "cashier_id" UUID NOT NULL,
    "receipt_number" INTEGER NOT NULL,
    "total_cents" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_items" (
    "id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "outlet_menu_item_id" UUID NOT NULL,
    "menu_item_name" VARCHAR(150) NOT NULL,
    "menu_item_sku" VARCHAR(50) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price_cents" INTEGER NOT NULL,
    "line_total_cents" INTEGER NOT NULL,

    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_counters" (
    "outlet_id" UUID NOT NULL,
    "next_number" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "receipt_counters_pkey" PRIMARY KEY ("outlet_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_outlet_id_idx" ON "users"("outlet_id");

-- CreateIndex
CREATE INDEX "users_role_is_active_idx" ON "users"("role", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "outlets_code_key" ON "outlets"("code");

-- CreateIndex
CREATE INDEX "outlets_is_active_idx" ON "outlets"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "menu_items_sku_key" ON "menu_items"("sku");

-- CreateIndex
CREATE INDEX "menu_items_is_active_category_idx" ON "menu_items"("is_active", "category");

-- CreateIndex
CREATE INDEX "menu_items_name_idx" ON "menu_items"("name");

-- CreateIndex
CREATE INDEX "outlet_menu_items_outlet_id_is_available_idx" ON "outlet_menu_items"("outlet_id", "is_available");

-- CreateIndex
CREATE INDEX "outlet_menu_items_menu_item_id_idx" ON "outlet_menu_items"("menu_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "outlet_menu_items_outlet_id_menu_item_id_key" ON "outlet_menu_items"("outlet_id", "menu_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "outlet_inventory_outlet_menu_item_id_key" ON "outlet_inventory"("outlet_menu_item_id");

-- CreateIndex
CREATE INDEX "outlet_inventory_quantity_idx" ON "outlet_inventory"("quantity");

-- CreateIndex
CREATE INDEX "sales_outlet_id_created_at_idx" ON "sales"("outlet_id", "created_at");

-- CreateIndex
CREATE INDEX "sales_cashier_id_idx" ON "sales"("cashier_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_outlet_id_receipt_number_key" ON "sales"("outlet_id", "receipt_number");

-- CreateIndex
CREATE INDEX "sale_items_sale_id_idx" ON "sale_items"("sale_id");

-- CreateIndex
CREATE INDEX "sale_items_outlet_menu_item_id_idx" ON "sale_items"("outlet_menu_item_id");

-- CreateIndex
CREATE INDEX "sale_items_menu_item_sku_idx" ON "sale_items"("menu_item_sku");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outlet_menu_items" ADD CONSTRAINT "outlet_menu_items_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outlet_menu_items" ADD CONSTRAINT "outlet_menu_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outlet_inventory" ADD CONSTRAINT "outlet_inventory_outlet_menu_item_id_fkey" FOREIGN KEY ("outlet_menu_item_id") REFERENCES "outlet_menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_cashier_id_fkey" FOREIGN KEY ("cashier_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_outlet_menu_item_id_fkey" FOREIGN KEY ("outlet_menu_item_id") REFERENCES "outlet_menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_counters" ADD CONSTRAINT "receipt_counters_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddCheckConstraints
ALTER TABLE "users" ADD CONSTRAINT "users_role_outlet_check" CHECK (
    ("role" = 'HQ_ADMIN' AND "outlet_id" IS NULL)
    OR ("role" = 'OUTLET_STAFF' AND "outlet_id" IS NOT NULL)
);

ALTER TABLE "outlet_menu_items" ADD CONSTRAINT "outlet_menu_items_price_cents_check" CHECK ("price_cents" > 0);

ALTER TABLE "outlet_inventory" ADD CONSTRAINT "outlet_inventory_quantity_check" CHECK ("quantity" >= 0);

ALTER TABLE "outlet_inventory" ADD CONSTRAINT "outlet_inventory_low_stock_threshold_check" CHECK ("low_stock_threshold" >= 0);

ALTER TABLE "sales" ADD CONSTRAINT "sales_receipt_number_check" CHECK ("receipt_number" > 0);

ALTER TABLE "sales" ADD CONSTRAINT "sales_total_cents_check" CHECK ("total_cents" >= 0);

ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_quantity_check" CHECK ("quantity" > 0);

ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_unit_price_cents_check" CHECK ("unit_price_cents" > 0);

ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_line_total_cents_check" CHECK ("line_total_cents" >= 0);

ALTER TABLE "receipt_counters" ADD CONSTRAINT "receipt_counters_next_number_check" CHECK ("next_number" >= 0);

-- CreateReceiptCounterTrigger
CREATE OR REPLACE FUNCTION create_receipt_counter_for_outlet()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO "receipt_counters" ("outlet_id", "next_number")
    VALUES (NEW."id", 0)
    ON CONFLICT ("outlet_id") DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER outlets_create_receipt_counter
AFTER INSERT ON "outlets"
FOR EACH ROW
EXECUTE FUNCTION create_receipt_counter_for_outlet();
