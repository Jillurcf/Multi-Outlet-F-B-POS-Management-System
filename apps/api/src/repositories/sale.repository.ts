import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import type { DbClient } from './types';

type SaleWithRelations = Prisma.SaleGetPayload<{
  include: {
    saleItems: true;
    outlet: true;
    cashier: { select: { fullName: true } };
  };
}>;

export type SaleRecord = SaleWithRelations;

export interface CreateSaleItemRecord {
  outletMenuItemId: string;
  menuItemName: string;
  menuItemSku: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

export interface CreateSaleRecord {
  outletId: string;
  cashierId: string;
  receiptNumber: number;
  totalCents: number;
  idempotencyKey?: string | null;
  items: CreateSaleItemRecord[];
}

const include = {
  saleItems: true,
  outlet: true,
  cashier: {
    select: {
      fullName: true
    }
  }
} as const;

export const saleRepository = {
  create(client: DbClient = prisma, data: CreateSaleRecord): Promise<SaleRecord> {
    return client.sale.create({
      data: {
        outletId: data.outletId,
        cashierId: data.cashierId,
        receiptNumber: data.receiptNumber,
        totalCents: data.totalCents,
        idempotencyKey: data.idempotencyKey ?? null,
        saleItems: {
          create: data.items.map((item) => ({
            outletMenuItemId: item.outletMenuItemId,
            menuItemName: item.menuItemName,
            menuItemSku: item.menuItemSku,
            quantity: item.quantity,
            unitPriceCents: item.unitPriceCents,
            lineTotalCents: item.lineTotalCents
          }))
        }
      },
      include
    });
  },

  findManyByOutletId(
    client: DbClient = prisma,
    outletId: string,
    skip: number,
    take: number
  ): Promise<SaleRecord[]> {
    return client.sale.findMany({
      where: { outletId },
      include,
      orderBy: { createdAt: 'desc' },
      skip,
      take
    });
  },

  findManyForRange(
    client: DbClient = prisma,
    outletId: string | null,
    from: Date,
    to: Date,
    take: number
  ): Promise<SaleRecord[]> {
    return client.sale.findMany({
      where: {
        ...(outletId ? { outletId } : {}),
        createdAt: { gte: from, lte: to }
      },
      include,
      orderBy: { createdAt: 'desc' },
      take
    });
  },

  countByOutletId(client: DbClient = prisma, outletId: string): Promise<number> {
    return client.sale.count({ where: { outletId } });
  },

  findByIdForOutlet(
    client: DbClient = prisma,
    saleId: string,
    outletId: string
  ): Promise<SaleRecord | null> {
    return client.sale.findFirst({
      where: { id: saleId, outletId },
      include
    });
  },

  findByIdempotencyKey(
    client: DbClient = prisma,
    outletId: string,
    idempotencyKey: string
  ): Promise<SaleRecord | null> {
    return client.sale.findFirst({
      where: { outletId, idempotencyKey },
      include
    });
  }
};
