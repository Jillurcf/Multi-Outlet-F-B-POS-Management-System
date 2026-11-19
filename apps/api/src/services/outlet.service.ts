import type { OutletDto, Paginated } from '@pos/shared';
import type { Outlet } from '@prisma/client';
import { NotFoundError } from '../errors/AppError';
import { outletRepository, type UpdateOutletRecord } from '../repositories/outlet.repository';

export interface CreateOutletInput {
  code: string;
  name: string;
  address?: string | null;
}

export interface UpdateOutletInput {
  code?: string;
  name?: string;
  address?: string | null;
}

function toDto(outlet: Outlet): OutletDto {
  return {
    id: outlet.id,
    code: outlet.code,
    name: outlet.name,
    address: outlet.address,
    isActive: outlet.isActive,
    createdAt: outlet.createdAt.toISOString(),
    updatedAt: outlet.updatedAt.toISOString()
  };
}

export const outletService = {
  async list(page: number, limit: number): Promise<Paginated<OutletDto>> {
    const [outlets, total] = await Promise.all([
      outletRepository.findMany((page - 1) * limit, limit),
      outletRepository.count()
    ]);

    return {
      items: outlets.map(toDto),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  },

  async getById(id: string): Promise<OutletDto> {
    const outlet = await outletRepository.findById(id);

    if (!outlet) {
      throw new NotFoundError('Outlet not found');
    }

    return toDto(outlet);
  },

  async create(input: CreateOutletInput): Promise<OutletDto> {
    const outlet = await outletRepository.create({
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      address: input.address?.trim() || null
    });

    return toDto(outlet);
  },

  async update(id: string, input: UpdateOutletInput): Promise<OutletDto> {
    await this.getById(id);

    const data: UpdateOutletRecord = {
      ...(input.code === undefined ? {} : { code: input.code.trim().toUpperCase() }),
      ...(input.name === undefined ? {} : { name: input.name.trim() }),
      ...(input.address === undefined ? {} : { address: input.address?.trim() || null })
    };

    return toDto(await outletRepository.update(id, data));
  },

  async deactivate(id: string): Promise<void> {
    await this.getById(id);
    await outletRepository.deactivate(id);
  }
};
