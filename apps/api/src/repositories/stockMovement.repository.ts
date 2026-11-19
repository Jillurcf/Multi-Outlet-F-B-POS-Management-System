import { Prisma, type StockMovement } from '@prisma/client';
import { prisma } from '../config/prisma';
import type { DbClient } from './types';

type MovementWithItem = Prisma.StockMovementGetPayload<{
  include: { outletMenuItem: { include: { menuItem: true } } };
}>;

export type StockMovementRecord = MovementWithItem;

export interface CreateStockMovementRecord {
  outletId: string;
  outletMenuItemId: string;
  movementType: 'RESTOCK' | 'ADJUSTMENT' | 'SALE';
  quantityBefore: number;
  quantityChange: number;
  quantityAfter: number;
  actorUserId?: string | null;
  saleId?: string | null;
  note?: string | null;
}

const include = {
  outletMenuItem: {
    include: {
      menuItem: true
    }
  }
} as const;

function whereFor(outletId: string, outletMenuItemId?: string) {
  return {
    outletId,
    ...(outletMenuItemId ? { outletMenuItemId } : {})
  };
}

export const stockMovementRepository = {
  create(client: DbClient = prisma, data: CreateStockMovementRecord): Promise<StockMovement> {
    return client.stockMovement.create({ data });
  },

  async createMany(
    client: DbClient = prisma,
    data: CreateStockMovementRecord[]
  ): Promise<number> {
    if (data.length === 0) {
      return 0;
    }

    const result = await client.stockMovement.createMany({ data });
    return result.count;
  },

  findManyByOutletId(
    outletId: string,
    outletMenuItemId: string | undefined,
    skip: number,
    take: number
  ): Promise<StockMovementRecord[]> {
    return prisma.stockMovement.findMany({
      where: whereFor(outletId, outletMenuItemId),
      include,
      orderBy: { createdAt: 'desc' },
      skip,
      take
    });
  },

  countByOutletId(outletId: string, outletMenuItemId?: string): Promise<number> {
    return prisma.stockMovement.count({ where: whereFor(outletId, outletMenuItemId) });
  }
};
