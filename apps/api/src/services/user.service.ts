import type { AuthUser } from '@pos/shared';
import bcrypt from 'bcryptjs';
import { NotFoundError } from '../errors/AppError';
import { outletRepository } from '../repositories/outlet.repository';
import { userRepository, type CreateUserRecord } from '../repositories/user.repository';

export interface CreateStaffInput {
  email: string;
  password: string;
  fullName: string;
  outletId: string;
}

export const userService = {
  async createStaff(input: CreateStaffInput): Promise<AuthUser> {
    const outlet = await outletRepository.findById(input.outletId);

    if (!outlet || !outlet.isActive) {
      throw new NotFoundError('Active outlet not found');
    }

    const data: CreateUserRecord = {
      email: input.email.trim().toLowerCase(),
      passwordHash: await bcrypt.hash(input.password, 12),
      fullName: input.fullName.trim(),
      role: 'OUTLET_STAFF',
      outletId: outlet.id
    };

    const user = await userRepository.create(data);

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      outletId: user.outletId
    };
  }
};
