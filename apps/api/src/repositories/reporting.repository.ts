import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import type { DbClient } from './types';

export interface DailySalesRow {
  day: Date;
  outletId: string;
  outletName: string;
  salesCount: number;
  revenueCents: number;
}

export interface LowStockRow {
  outletMenuItemId: string;
  outletId: string;
  outletName: string;
  sku: string;
  name: string;
  quantity: number;
  lowStockThreshold: number;
}

export interface SalesSummaryRow {
  salesCount: number;
  revenueCents: number;
}

export interface OutletRevenueRow {
  outletId: string;
  outletName: string;
  revenueCents: number;
  transactionCount: number;
}

export interface TopSellingItemRow {
  outletId: string;
  outletName: string;
  rank: number;
  menuItemSku: string;
  menuItemName: string;
  quantitySold: number;
  revenueCents: number;
}

function outletFilter(outletId: string | null) {
  return outletId ? Prisma.sql`AND omi."outlet_id" = ${outletId}::uuid` : Prisma.sql``;
}

function salesOutletFilter(outletId: string | null) {
  return outletId ? Prisma.sql`AND s."outlet_id" = ${outletId}::uuid` : Prisma.sql``;
}

export const reportingRepository = {
  dailySalesByOutlet(
    client: DbClient = prisma,
    from: Date,
    to: Date
  ): Promise<DailySalesRow[]> {
    return client.$queryRaw<DailySalesRow[]>(Prisma.sql`
      SELECT
        date_trunc('day', s."created_at") AS "day",
        s."outlet_id" AS "outletId",
        o."name" AS "outletName",
        COUNT(*)::int AS "salesCount",
        COALESCE(SUM(s."total_cents"), 0)::int AS "revenueCents"
      FROM "sales" AS s
      INNER JOIN "outlets" AS o ON o."id" = s."outlet_id"
      WHERE s."created_at" >= ${from} AND s."created_at" <= ${to}
      GROUP BY date_trunc('day', s."created_at"), s."outlet_id", o."name"
      ORDER BY "day" DESC, o."name" ASC
    `);
  },

  async salesSummary(
    client: DbClient = prisma,
    outletId: string | null,
    from: Date,
    to: Date
  ): Promise<SalesSummaryRow> {
    const rows = await client.$queryRaw<SalesSummaryRow[]>(Prisma.sql`
      SELECT
        COUNT(*)::int AS "salesCount",
        COALESCE(SUM(s."total_cents"), 0)::int AS "revenueCents"
      FROM "sales" AS s
      WHERE s."created_at" >= ${from} AND s."created_at" <= ${to}
        ${salesOutletFilter(outletId)}
    `);

    return rows[0] ?? { salesCount: 0, revenueCents: 0 };
  },

  outletRevenue(client: DbClient = prisma, from: Date, to: Date): Promise<OutletRevenueRow[]> {
    return client.$queryRaw<OutletRevenueRow[]>(Prisma.sql`
      SELECT
        o."id" AS "outletId",
        o."name" AS "outletName",
        COALESCE(SUM(s."total_cents"), 0)::int AS "revenueCents",
        COUNT(s."id")::int AS "transactionCount"
      FROM "outlets" AS o
      LEFT JOIN "sales" AS s
        ON s."outlet_id" = o."id"
        AND s."created_at" >= ${from}
        AND s."created_at" <= ${to}
      GROUP BY o."id", o."name"
      ORDER BY "revenueCents" DESC, o."name" ASC
    `);
  },

  topSellingItems(
    client: DbClient = prisma,
    from: Date,
    to: Date,
    limit = 5
  ): Promise<TopSellingItemRow[]> {
    return client.$queryRaw<TopSellingItemRow[]>(Prisma.sql`
      WITH item_totals AS (
        SELECT
          s."outlet_id" AS "outletId",
          o."name" AS "outletName",
          si."menu_item_sku" AS "menuItemSku",
          MAX(si."menu_item_name") AS "menuItemName",
          SUM(si."quantity")::int AS "quantitySold",
          SUM(si."line_total_cents")::int AS "revenueCents"
        FROM "sales" AS s
        INNER JOIN "sale_items" AS si ON si."sale_id" = s."id"
        INNER JOIN "outlets" AS o ON o."id" = s."outlet_id"
        WHERE s."created_at" >= ${from} AND s."created_at" <= ${to}
        GROUP BY s."outlet_id", o."name", si."menu_item_sku"
      ), ranked AS (
        SELECT
          "outletId",
          "outletName",
          ROW_NUMBER() OVER (
            PARTITION BY "outletId"
            ORDER BY "quantitySold" DESC, "revenueCents" DESC, "menuItemSku" ASC
          ) AS "rank",
          "menuItemSku",
          "menuItemName",
          "quantitySold",
          "revenueCents"
        FROM item_totals
      )
      SELECT
        "outletId",
        "outletName",
        "rank"::int AS "rank",
        "menuItemSku",
        "menuItemName",
        "quantitySold",
        "revenueCents"
      FROM ranked
      WHERE "rank" <= ${limit}
      ORDER BY "outletName" ASC, "rank" ASC
    `);
  },

  async lowStockItems(
    client: DbClient = prisma,
    outletId: string | null,
    skip: number,
    take: number
  ): Promise<LowStockRow[]> {
    return client.$queryRaw<LowStockRow[]>(Prisma.sql`
      SELECT
        omi."id" AS "outletMenuItemId",
        omi."outlet_id" AS "outletId",
        o."name" AS "outletName",
        mi."sku" AS "sku",
        mi."name" AS "name",
        oi."quantity" AS "quantity",
        oi."low_stock_threshold" AS "lowStockThreshold"
      FROM "outlet_inventory" AS oi
      INNER JOIN "outlet_menu_items" AS omi ON omi."id" = oi."outlet_menu_item_id"
      INNER JOIN "menu_items" AS mi ON mi."id" = omi."menu_item_id"
      INNER JOIN "outlets" AS o ON o."id" = omi."outlet_id"
      WHERE oi."quantity" < oi."low_stock_threshold"
        ${outletFilter(outletId)}
      ORDER BY oi."quantity" ASC, mi."name" ASC
      LIMIT ${take} OFFSET ${skip}
    `);
  },

  async countLowStockItems(client: DbClient = prisma, outletId: string | null): Promise<number> {
    const rows = await client.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      SELECT COUNT(*)::int AS "count"
      FROM "outlet_inventory" AS oi
      INNER JOIN "outlet_menu_items" AS omi ON omi."id" = oi."outlet_menu_item_id"
      WHERE oi."quantity" < oi."low_stock_threshold"
        ${outletFilter(outletId)}
    `);

    return rows[0]?.count ?? 0;
  }
};
