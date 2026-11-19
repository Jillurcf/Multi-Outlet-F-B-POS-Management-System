import type { MenuItemDto, Paginated } from '@pos/shared';
import type { MenuItem } from '@prisma/client';
import { NotFoundError } from '../errors/AppError';
import { menuItemRepository, type UpdateMenuItemRecord } from '../repositories/menuItem.repository';

export interface CreateMenuItemInput {
  sku: string;
  name: string;
  category: string;
  description?: string | null;
}

export interface UpdateMenuItemInput {
  sku?: string;
  name?: string;
  category?: string;
  description?: string | null;
}

function toDto(menuItem: MenuItem): MenuItemDto {
  return {
    id: menuItem.id,
    sku: menuItem.sku,
    name: menuItem.name,
    category: menuItem.category,
    description: menuItem.description,
    isActive: menuItem.isActive,
    createdAt: menuItem.createdAt.toISOString(),
    updatedAt: menuItem.updatedAt.toISOString()
  };
}

function optionalText(value: string | null | undefined): string | null | undefined {
  if (value === undefined || value === null) {
    return value;
  }
  return value.trim() || null;
}

export const menuItemService = {
  async list(page: number, limit: number): Promise<Paginated<MenuItemDto>> {
    const [items, total] = await Promise.all([
      menuItemRepository.findMany((page - 1) * limit, limit),
      menuItemRepository.count()
    ]);

    return {
      items: items.map(toDto),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  },

  async getById(id: string): Promise<MenuItemDto> {
    const menuItem = await menuItemRepository.findById(id);

    if (!menuItem) {
      throw new NotFoundError('Menu item not found');
    }

    return toDto(menuItem);
  },

  async create(input: CreateMenuItemInput): Promise<MenuItemDto> {
    const menuItem = await menuItemRepository.create({
      sku: input.sku.trim().toUpperCase(),
      name: input.name.trim(),
      category: input.category.trim(),
      description: optionalText(input.description) ?? null
    });

    return toDto(menuItem);
  },

  async update(id: string, input: UpdateMenuItemInput): Promise<MenuItemDto> {
    await this.getById(id);

    const data: UpdateMenuItemRecord = {
      ...(input.sku === undefined ? {} : { sku: input.sku.trim().toUpperCase() }),
      ...(input.name === undefined ? {} : { name: input.name.trim() }),
      ...(input.category === undefined ? {} : { category: input.category.trim() }),
      ...(input.description === undefined ? {} : { description: optionalText(input.description) ?? null })
    };

    return toDto(await menuItemRepository.update(id, data));
  },

  async deactivate(id: string): Promise<void> {
    await this.getById(id);
    await menuItemRepository.deactivate(id);
  }
};
