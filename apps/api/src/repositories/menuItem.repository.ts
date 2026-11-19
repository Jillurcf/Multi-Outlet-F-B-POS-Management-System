import type { MenuItem } from '@prisma/client';
import { prisma } from '../config/prisma';

export interface CreateMenuItemRecord {
  sku: string;
  name: string;
  category: string;
  description: string | null;
}

export interface UpdateMenuItemRecord {
  sku?: string;
  name?: string;
  category?: string;
  description?: string | null;
}

export const menuItemRepository = {
  findMany(skip: number, take: number): Promise<MenuItem[]> {
    return prisma.menuItem.findMany({
      orderBy: { createdAt: 'desc' },
      skip,
      take
    });
  },

  count(): Promise<number> {
    return prisma.menuItem.count();
  },

  countActive(): Promise<number> {
    return prisma.menuItem.count({ where: { isActive: true } });
  },

  findById(id: string): Promise<MenuItem | null> {
    return prisma.menuItem.findUnique({ where: { id } });
  },

  create(data: CreateMenuItemRecord): Promise<MenuItem> {
    return prisma.menuItem.create({ data });
  },

  update(id: string, data: UpdateMenuItemRecord): Promise<MenuItem> {
    return prisma.menuItem.update({ where: { id }, data });
  },

  deactivate(id: string): Promise<MenuItem> {
    return prisma.menuItem.update({ where: { id }, data: { isActive: false } });
  }
};
