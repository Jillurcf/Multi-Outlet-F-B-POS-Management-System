import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import type { DbClient } from './types';

type OutletMenuItemWithRelations = Prisma.OutletMenuItemGetPayload<{
  include: { menuItem: true; inventory: true };
}>;

export type OutletMenuItemRecord = OutletMenuItemWithRelations;

export interface CreateOutletMenuItemRecord {
  outletId: string;
  menuItemId: string;
  priceCents: number;
  isAvailable: boolean;
}

export interface UpdateOutletMenuItemRecord {
  priceCents?: number;
  isAvailable?: boolean;
}

export interface AssignableOutletMenuItemRow {
  outletMenuItemId: string;
  priceCents: number;
  isAvailable: boolean;
  name: string;
  sku: string;
}

const include = {
  menuItem: true,
  inventory: true
} as const;

function listWhere(outletId: string, onlyAvailable: boolean) {
  return {
    outletId,
    ...(onlyAvailable ? { isAvailable: true, menuItem: { isActive: true } } : {})
  };
}

export const outletMenuItemRepository = {
  findManyByOutletId(
    outletId: string,
    skip: number,
    take: number,
    onlyAvailable = false
  ): Promise<OutletMenuItemRecord[]> {
    return prisma.outletMenuItem.findMany({
      where: listWhere(outletId, onlyAvailable),
      include,
      orderBy: { menuItem: { name: 'asc' } },
      skip,
      take
    });
  },

  countByOutletId(outletId: string, onlyAvailable = false): Promise<number> {
    return prisma.outletMenuItem.count({
      where: listWhere(outletId, onlyAvailable)
    });
  },

  findByOutletAndMenuItem(
    outletId: string,
    menuItemId: string
  ): Promise<OutletMenuItemRecord | null> {
    return prisma.outletMenuItem.findUnique({
      where: {
        outletId_menuItemId: { outletId, menuItemId }
      },
      include
    });
  },

  findByIdForOutlet(id: string, outletId: string): Promise<OutletMenuItemRecord | null> {
    return prisma.outletMenuItem.findFirst({
      where: { id, outletId },
      include
    });
  },

  create(data: CreateOutletMenuItemRecord): Promise<OutletMenuItemRecord> {
    return prisma.outletMenuItem.create({
      data: {
        ...data,
        inventory: {
          create: {
            quantity: 0,
            lowStockThreshold: 0
          }
        }
      },
      include
    });
  },

  update(id: string, data: UpdateOutletMenuItemRecord): Promise<OutletMenuItemRecord> {
    return prisma.outletMenuItem.update({
      where: { id },
      data,
      include
    });
  },

  deactivate(id: string): Promise<OutletMenuItemRecord> {
    return prisma.outletMenuItem.update({
      where: { id },
      data: { isAvailable: false },
      include
    });
  },

  async findAssignableByIds(
    client: DbClient,
    outletId: string,
    ids: string[]
  ): Promise<AssignableOutletMenuItemRow[]> {
    if (ids.length === 0) {
      return [];
    }

    return client.$queryRaw<AssignableOutletMenuItemRow[]>(Prisma.sql`
      SELECT
        omi."id" AS "outletMenuItemId",
        omi."price_cents" AS "priceCents",
        omi."is_available" AS "isAvailable",
        mi."name" AS "name",
        mi."sku" AS "sku"
      FROM "outlet_menu_items" AS omi
      INNER JOIN "menu_items" AS mi ON mi."id" = omi."menu_item_id"
      WHERE omi."outlet_id" = ${outletId}::uuid
        AND omi."id" IN (${Prisma.join(ids)})
        AND mi."is_active" = TRUE
    `);
  }
};
