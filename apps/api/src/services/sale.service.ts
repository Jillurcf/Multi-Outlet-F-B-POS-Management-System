import type { Paginated, ReceiptDto, SaleDto } from '@pos/shared';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import {
  BadRequestError,
  ConflictError,
  InsufficientStockError,
  NotFoundError
} from '../errors/AppError';
import { toSaleDto } from '../mappers/sale.mapper';
import { outletInventoryRepository } from '../repositories/outletInventory.repository';
import { outletMenuItemRepository } from '../repositories/outletMenuItem.repository';
import { receiptCounterRepository } from '../repositories/receiptCounter.repository';
import {
  saleRepository,
  type CreateSaleItemRecord,
  type SaleRecord
} from '../repositories/sale.repository';
import {
  stockMovementRepository,
  type CreateStockMovementRecord
} from '../repositories/stockMovement.repository';

export interface SaleItemInput {
  outletMenuItemId: string;
  quantity: number;
}

const MAX_DB_INT = 2_147_483_647;
const MAX_ITEMS = 50;
const MAX_ITEM_QUANTITY = 1_000;

function isUniqueConstraintError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === 'P2002';
  }

  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

export const saleService = {
  async createSale(
    outletId: string,
    cashierId: string,
    items: SaleItemInput[],
    idempotencyKey?: string
  ): Promise<SaleDto> {
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestError('At least one sale item is required');
    }

    if (items.length > MAX_ITEMS) {
      throw new BadRequestError(`A sale can contain at most ${MAX_ITEMS} items`);
    }

    const itemIds = items.map((item) => item.outletMenuItemId);

    if (new Set(itemIds).size !== itemIds.length) {
      throw new BadRequestError('Duplicate items are not allowed');
    }

    for (const item of items) {
      if (!Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > MAX_ITEM_QUANTITY) {
        throw new BadRequestError('Item quantities must be positive integers');
      }
    }

    try {
      return await prisma.$transaction(
        async (tx) => {
          if (idempotencyKey) {
            const existing = await saleRepository.findByIdempotencyKey(tx, outletId, idempotencyKey);

            if (existing) {
              return toSaleDto(existing);
            }
          }

          const assignments = await outletMenuItemRepository.findAssignableByIds(
            tx,
            outletId,
            itemIds
          );

          if (assignments.length !== itemIds.length) {
            throw new BadRequestError('One or more items are not assigned to this outlet');
          }

          const assignmentById = new Map(
            assignments.map((assignment) => [assignment.outletMenuItemId, assignment])
          );
          const sortedItems = [...items].sort((left, right) =>
            left.outletMenuItemId.localeCompare(right.outletMenuItemId)
          );
          const saleItems: CreateSaleItemRecord[] = [];
          const stockMovements: CreateStockMovementRecord[] = [];
          let totalCents = 0;

          for (const line of sortedItems) {
            const assignment = assignmentById.get(line.outletMenuItemId);

            if (!assignment) {
              throw new BadRequestError('One or more items are not assigned to this outlet');
            }

            if (!assignment.isAvailable) {
              throw new ConflictError(`${assignment.name} is not available at this outlet`);
            }

            if (
              !Number.isInteger(assignment.priceCents) ||
              assignment.priceCents <= 0 ||
              assignment.priceCents > MAX_DB_INT
            ) {
              throw new BadRequestError(`${assignment.name} has an invalid outlet price`);
            }

            const lineTotalCents = assignment.priceCents * line.quantity;

            if (lineTotalCents > MAX_DB_INT) {
              throw new BadRequestError('Line total is too large');
            }

            const remainingQuantity = await outletInventoryRepository.deductStock(
              tx,
              outletId,
              line.outletMenuItemId,
              line.quantity
            );

            if (remainingQuantity === null) {
              throw new InsufficientStockError({
                outletMenuItemId: line.outletMenuItemId,
                requestedQuantity: line.quantity
              });
            }

            stockMovements.push({
              outletId,
              outletMenuItemId: line.outletMenuItemId,
              movementType: 'SALE',
              quantityBefore: remainingQuantity + line.quantity,
              quantityChange: -line.quantity,
              quantityAfter: remainingQuantity,
              actorUserId: cashierId
            });

            totalCents += lineTotalCents;

            if (totalCents > MAX_DB_INT) {
              throw new BadRequestError('Sale total is too large');
            }

            saleItems.push({
              outletMenuItemId: line.outletMenuItemId,
              menuItemName: assignment.name,
              menuItemSku: assignment.sku,
              quantity: line.quantity,
              unitPriceCents: assignment.priceCents,
              lineTotalCents
            });
          }

          const receiptNumber = await receiptCounterRepository.nextNumber(tx, outletId);
          const sale: SaleRecord = await saleRepository.create(tx, {
            outletId,
            cashierId,
            receiptNumber,
            totalCents,
            idempotencyKey: idempotencyKey ?? null,
            items: saleItems
          });

          await stockMovementRepository.createMany(
            tx,
            stockMovements.map((movement) => ({ ...movement, saleId: sale.id }))
          );

          return toSaleDto(sale);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
      );
    } catch (error) {
      if (idempotencyKey && isUniqueConstraintError(error)) {
        const existing = await saleRepository.findByIdempotencyKey(
          prisma,
          outletId,
          idempotencyKey
        );

        if (existing) {
          return toSaleDto(existing);
        }
      }

      throw error;
    }
  },

  async listForOutlet(outletId: string, page: number, limit: number): Promise<Paginated<SaleDto>> {
    const [sales, total] = await Promise.all([
      saleRepository.findManyByOutletId(prisma, outletId, (page - 1) * limit, limit),
      saleRepository.countByOutletId(prisma, outletId)
    ]);

    return {
      items: sales.map(toSaleDto),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  },

  async getByIdForOutlet(saleId: string, outletId: string): Promise<SaleDto> {
    const sale = await saleRepository.findByIdForOutlet(prisma, saleId, outletId);

    if (!sale) {
      throw new NotFoundError('Sale not found for this outlet');
    }

    return toSaleDto(sale);
  },

  async getReceiptForOutlet(saleId: string, outletId: string): Promise<ReceiptDto> {
    const sale = await this.getByIdForOutlet(saleId, outletId);

    return {
      ...sale,
      receiptTitle: `Receipt #${sale.receiptNumber}`
    };
  }
};
