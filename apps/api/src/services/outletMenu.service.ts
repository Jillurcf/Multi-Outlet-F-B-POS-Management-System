import type { OutletMenuItemDto, Paginated } from '@pos/shared';
import { ConflictError, NotFoundError } from '../errors/AppError';
import { menuItemRepository } from '../repositories/menuItem.repository';
import {
  outletMenuItemRepository,
  type OutletMenuItemRecord,
  type UpdateOutletMenuItemRecord
} from '../repositories/outletMenuItem.repository';
import { outletRepository } from '../repositories/outlet.repository';

export interface AssignMenuItemInput {
  menuItemId: string;
  priceCents: number;
  isAvailable: boolean;
}

export interface UpdateAssignmentInput {
  priceCents?: number;
  isAvailable?: boolean;
}

function toDto(record: OutletMenuItemRecord): OutletMenuItemDto {
  return {
    id: record.id,
    outletId: record.outletId,
    menuItemId: record.menuItemId,
    sku: record.menuItem.sku,
    name: record.menuItem.name,
    category: record.menuItem.category,
    description: record.menuItem.description,
    priceCents: record.priceCents,
    isAvailable: record.isAvailable,
    quantity: record.inventory?.quantity ?? 0,
    lowStockThreshold: record.inventory?.lowStockThreshold ?? 0,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export const outletMenuService = {
  async listForOutlet(outletId: string, page: number, limit: number): Promise<Paginated<OutletMenuItemDto>> {
    const outlet = await outletRepository.findById(outletId);

    if (!outlet) {
      throw new NotFoundError('Outlet not found');
    }

    const [items, total] = await Promise.all([
      outletMenuItemRepository.findManyByOutletId(outletId, (page - 1) * limit, limit),
      outletMenuItemRepository.countByOutletId(outletId)
    ]);

    return {
      items: items.map(toDto),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  },

  async listAvailableForOutlet(
    outletId: string,
    page: number,
    limit: number
  ): Promise<Paginated<OutletMenuItemDto>> {
    const [items, total] = await Promise.all([
      outletMenuItemRepository.findManyByOutletId(outletId, (page - 1) * limit, limit, true),
      outletMenuItemRepository.countByOutletId(outletId, true)
    ]);

    return {
      items: items.map(toDto),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  },

  async assign(outletId: string, input: AssignMenuItemInput): Promise<OutletMenuItemDto> {
    const [outlet, menuItem] = await Promise.all([
      outletRepository.findById(outletId),
      menuItemRepository.findById(input.menuItemId)
    ]);

    if (!outlet) {
      throw new NotFoundError('Outlet not found');
    }

    if (!outlet.isActive) {
      throw new ConflictError('Cannot assign menu items to an inactive outlet');
    }

    if (!menuItem) {
      throw new NotFoundError('Menu item not found');
    }

    if (!menuItem.isActive) {
      throw new ConflictError('Cannot assign an inactive menu item');
    }

    const assignment = await outletMenuItemRepository.create({
      outletId,
      menuItemId: input.menuItemId,
      priceCents: input.priceCents,
      isAvailable: input.isAvailable
    });

    return toDto(assignment);
  },

  async updateAssignment(
    outletId: string,
    menuItemId: string,
    input: UpdateAssignmentInput
  ): Promise<OutletMenuItemDto> {
    const assignment = await outletMenuItemRepository.findByOutletAndMenuItem(outletId, menuItemId);

    if (!assignment) {
      throw new NotFoundError('Outlet menu item assignment not found');
    }

    const data: UpdateOutletMenuItemRecord = {
      ...(input.priceCents === undefined ? {} : { priceCents: input.priceCents }),
      ...(input.isAvailable === undefined ? {} : { isAvailable: input.isAvailable })
    };

    return toDto(await outletMenuItemRepository.update(assignment.id, data));
  },

  async deactivateAssignment(outletId: string, menuItemId: string): Promise<void> {
    const assignment = await outletMenuItemRepository.findByOutletAndMenuItem(outletId, menuItemId);

    if (!assignment) {
      throw new NotFoundError('Outlet menu item assignment not found');
    }

    await outletMenuItemRepository.deactivate(assignment.id);
  }
};
