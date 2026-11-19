import type { OutletInventoryDto, Paginated, StockMovementDto } from '@pos/shared';
import { BadRequestError, NotFoundError } from '../errors/AppError';
import {
  outletInventoryRepository,
  type OutletInventoryRecord,
  type UpdateStockRecord
} from '../repositories/outletInventory.repository';
import {
  stockMovementRepository,
  type StockMovementRecord
} from '../repositories/stockMovement.repository';

export interface AddStockInput {
  quantity: number;
  note?: string;
}

export interface UpdateInventoryInput {
  quantity?: number;
  lowStockThreshold?: number;
}

function toDto(record: OutletInventoryRecord): OutletInventoryDto {
  const { outletMenuItem } = record;

  return {
    id: record.id,
    outletMenuItemId: record.outletMenuItemId,
    menuItemId: outletMenuItem.menuItemId,
    sku: outletMenuItem.menuItem.sku,
    name: outletMenuItem.menuItem.name,
    priceCents: outletMenuItem.priceCents,
    quantity: record.quantity,
    lowStockThreshold: record.lowStockThreshold,
    updatedAt: record.updatedAt.toISOString()
  };
}

function toMovementDto(record: StockMovementRecord): StockMovementDto {
  return {
    id: record.id,
    outletId: record.outletId,
    outletMenuItemId: record.outletMenuItemId,
    sku: record.outletMenuItem.menuItem.sku,
    name: record.outletMenuItem.menuItem.name,
    movementType: record.movementType,
    quantityBefore: record.quantityBefore,
    quantityChange: record.quantityChange,
    quantityAfter: record.quantityAfter,
    actorUserId: record.actorUserId,
    saleId: record.saleId,
    note: record.note,
    createdAt: record.createdAt.toISOString()
  };
}

export const inventoryService = {
  async listForOutlet(
    outletId: string,
    page: number,
    limit: number
  ): Promise<Paginated<OutletInventoryDto>> {
    const [items, total] = await Promise.all([
      outletInventoryRepository.findManyByOutletId(outletId, (page - 1) * limit, limit),
      outletInventoryRepository.countByOutletId(outletId)
    ]);

    return {
      items: items.map(toDto),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  },

  async listMovementsForOutlet(
    outletId: string,
    outletMenuItemId: string | undefined,
    page: number,
    limit: number
  ): Promise<Paginated<StockMovementDto>> {
    const [items, total] = await Promise.all([
      stockMovementRepository.findManyByOutletId(
        outletId,
        outletMenuItemId,
        (page - 1) * limit,
        limit
      ),
      stockMovementRepository.countByOutletId(outletId, outletMenuItemId)
    ]);

    return {
      items: items.map(toMovementDto),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  },

  async addStockForOutlet(
    outletId: string,
    outletMenuItemId: string,
    input: AddStockInput,
    actorUserId: string
  ): Promise<OutletInventoryDto> {
    if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
      throw new BadRequestError('Stock quantity must be a positive integer');
    }

    const updated = await outletInventoryRepository.addStock(
      outletId,
      outletMenuItemId,
      input.quantity,
      actorUserId,
      input.note?.trim() || null
    );

    if (!updated) {
      throw new NotFoundError('Inventory record not found for this outlet');
    }

    return toDto(updated);
  },

  async updateForOutlet(
    outletId: string,
    outletMenuItemId: string,
    input: UpdateInventoryInput,
    actorUserId: string
  ): Promise<OutletInventoryDto> {
    if (input.quantity === undefined && input.lowStockThreshold === undefined) {
      throw new BadRequestError('At least one stock field is required');
    }

    if (input.quantity !== undefined && (!Number.isInteger(input.quantity) || input.quantity < 0)) {
      throw new BadRequestError('Stock quantity must be a non-negative integer');
    }

    const data: UpdateStockRecord = {
      ...(input.quantity === undefined ? {} : { quantity: input.quantity }),
      ...(input.lowStockThreshold === undefined ? {} : { lowStockThreshold: input.lowStockThreshold })
    };

    const updated = await outletInventoryRepository.updateStock(
      outletId,
      outletMenuItemId,
      data,
      actorUserId
    );

    if (!updated) {
      throw new NotFoundError('Inventory record not found for this outlet');
    }

    return toDto(updated);
  }
};
