import type { Outlet } from '@prisma/client';
import { prisma } from '../config/prisma';

export interface CreateOutletRecord {
  code: string;
  name: string;
  address: string | null;
}

export interface UpdateOutletRecord {
  code?: string;
  name?: string;
  address?: string | null;
}

export const outletRepository = {
  findMany(skip: number, take: number): Promise<Outlet[]> {
    return prisma.outlet.findMany({
      orderBy: { createdAt: 'desc' },
      skip,
      take
    });
  },

  count(): Promise<number> {
    return prisma.outlet.count();
  },

  countActive(): Promise<number> {
    return prisma.outlet.count({ where: { isActive: true } });
  },

  findById(id: string): Promise<Outlet | null> {
    return prisma.outlet.findUnique({ where: { id } });
  },

  create(data: CreateOutletRecord): Promise<Outlet> {
    return prisma.outlet.create({ data });
  },

  update(id: string, data: UpdateOutletRecord): Promise<Outlet> {
    return prisma.outlet.update({ where: { id }, data });
  },

  deactivate(id: string): Promise<Outlet> {
    return prisma.outlet.update({ where: { id }, data: { isActive: false } });
  }
};
