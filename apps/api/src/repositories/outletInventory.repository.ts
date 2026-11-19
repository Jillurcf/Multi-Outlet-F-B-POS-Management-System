import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { stockMovementRepository } from './stockMovement.repository';
import type { DbClient } from './types';

type InventoryWithRelations = Prisma.OutletInventoryGetPayload<{
  include: { outletMenuItem: { include: { menuItem: true } } };
}>;

export type OutletInventoryRecord = InventoryWithRelations;

export interface UpdateStockRecord {
  quantity?: number;
  lowStockThreshold?: number;
}

const include = {
  outletMenuItem: {
    include: {
      menuItem: true
    }
  }
} as const;

function scopedWhere(outletId: string, outletMenuItemId: string) {
  return {
    outletMenuItemId,
    outletMenuItem: { outletId }
  };
}

export const outletInventoryRepository = {
  findManyByOutletId(
    outletId: string,
    skip: number,
    take: number
  ): Promise<OutletInventoryRecord[]> {
    return prisma.outletInventory.findMany({
      where: { outletMenuItem: { outletId } },
      include,
      orderBy: { outletMenuItem: { menuItem: { name: 'asc' } } },
      skip,
      take
    });
  },

  countByOutletId(outletId: string): Promise<number> {
    return prisma.outletInventory.count({
      where: { outletMenuItem: { outletId } }
    });
  },

  findByOutletMenuItemId(
    outletMenuItemId: string,
    outletId: string
  ): Promise<OutletInventoryRecord | null> {
    return prisma.outletInventory.findFirst({
      where: scopedWhere(outletId, outletMenuItemId),
      include
    });
  },

  async addStock(
    outletId: string,
    outletMenuItemId: string,
    quantity: number,
    actorUserId: string | null,
    note: string | null
  ): Promise<OutletInventoryRecord | null> {
    return prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ quantityBefore: number; quantityAfter: number }>>(Prisma.sql`
        UPDATE "outlet_inventory" AS oi
        SET "quantity" = oi."quantity" + ${quantity}, "updated_at" = NOW()
        FROM "outlet_menu_items" AS omi
        WHERE oi."outlet_menu_item_id" = omi."id"
          AND omi."id" = ${outletMenuItemId}::uuid
          AND omi."outlet_id" = ${outletId}::uuid
        RETURNING oi."quantity" - ${quantity} AS "quantityBefore", oi."quantity" AS "quantityAfter"
      `);

      const row = rows[0];

      if (!row) {
        return null;
      }

      await stockMovementRepository.create(tx, {
        outletId,
        outletMenuItemId,
        movementType: 'RESTOCK',
        quantityBefore: row.quantityBefore,
        quantityChange: quantity,
        quantityAfter: row.quantityAfter,
        actorUserId,
        note
      });

      return tx.outletInventory.findFirst({
        where: scopedWhere(outletId, outletMenuItemId),
        include
      });
    });
  },

  async updateStock(
    outletId: string,
    outletMenuItemId: string,
    data: UpdateStockRecord,
    actorUserId: string | null
  ): Promise<OutletInventoryRecord | null> {
    return prisma.$transaction(async (tx) => {
      const current = await tx.outletInventory.findFirst({
        where: scopedWhere(outletId, outletMenuItemId),
        include
      });

      if (!current) {
        return null;
      }

      if (data.quantity !== undefined && data.quantity !== current.quantity) {
        const rows = await tx.$queryRaw<Array<{ quantityAfter: number }>>(Prisma.sql`
          UPDATE "outlet_inventory" AS oi
          SET "quantity" = ${data.quantity}, "updated_at" = NOW()
          FROM "outlet_menu_items" AS omi
          WHERE oi."outlet_menu_item_id" = omi."id"
            AND omi."id" = ${outletMenuItemId}::uuid
            AND omi."outlet_id" = ${outletId}::uuid
            AND ${data.quantity} >= 0
          RETURNING oi."quantity" AS "quantityAfter"
        `);

        const row = rows[0];

        if (!row) {
          return null;
        }

        await stockMovementRepository.create(tx, {
          outletId,
          outletMenuItemId,
          movementType: 'ADJUSTMENT',
          quantityBefore: current.quantity,
          quantityChange: data.quantity - current.quantity,
          quantityAfter: row.quantityAfter,
          actorUserId,
          note: null
        });
      }

      if (data.lowStockThreshold !== undefined) {
        await tx.outletInventory.update({
          where: { id: current.id },
          data: { lowStockThreshold: data.lowStockThreshold }
        });
      }

      return tx.outletInventory.findFirst({
        where: scopedWhere(outletId, outletMenuItemId),
        include
      });
    });
  },

  async deductStock(
    client: DbClient,
    outletId: string,
    outletMenuItemId: string,
    quantity: number
  ): Promise<number | null> {
    const rows = await client.$queryRaw<Array<{ id: string; quantity: number }>>(Prisma.sql`
      UPDATE "outlet_inventory" AS oi
      SET "quantity" = oi."quantity" - ${quantity},
          "updated_at" = NOW()
      FROM "outlet_menu_items" AS omi
      WHERE oi."outlet_menu_item_id" = omi."id"
        AND omi."outlet_id" = ${outletId}::uuid
        AND oi."outlet_menu_item_id" = ${outletMenuItemId}::uuid
        AND oi."quantity" >= ${quantity}
      RETURNING oi."id" AS "id", oi."quantity" AS "quantity"
    `);

    return rows[0]?.quantity ?? null;
  }
};
