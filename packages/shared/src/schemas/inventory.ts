import { z } from 'zod';
import { paginationQuerySchema, uuidSchema } from './common';

const quantitySchema = z.number().int().min(0).max(1_000_000);

const stockChangeSchema = z.number().int().positive().max(1_000_000);

export const outletMenuItemIdParamSchema = z
  .object({
    outletMenuItemId: uuidSchema
  })
  .strict();

export const updateInventoryBodySchema = z
  .object({
    quantity: quantitySchema.optional(),
    lowStockThreshold: quantitySchema.optional()
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required'
  });

export const addStockBodySchema = z
  .object({
    quantity: stockChangeSchema,
    note: z.string().trim().max(255).optional()
  })
  .strict();

export const listStockMovementsQuerySchema = paginationQuerySchema.extend({
  outletMenuItemId: uuidSchema.optional()
});

export const listInventoryQuerySchema = paginationQuerySchema;
