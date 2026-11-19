-- HQ reporting indexes
-- Supports date-range scans across all outlets for revenue and transaction totals.
CREATE INDEX "sales_created_at_outlet_id_idx" ON "sales"("created_at", "outlet_id");

-- Supports the sale -> sale item join used when ranking items per outlet.
CREATE INDEX "sale_items_sale_id_menu_item_sku_idx" ON "sale_items"("sale_id", "menu_item_sku");
