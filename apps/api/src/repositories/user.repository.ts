import type { User } from '@prisma/client';
import { prisma } from '../config/prisma';

export interface CreateUserRecord {
  email: string;
  passwordHash: string;
  fullName: string;
  role: 'HQ_ADMIN' | 'OUTLET_STAFF';
  outletId: string | null;
}

export const userRepository = {
  findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
  },

  findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  },

  create(data: CreateUserRecord): Promise<User> {
    return prisma.user.create({ data });
  }
};
