import { z } from 'zod';
import { paginationQuerySchema, uuidSchema } from './common';

const priceCentsSchema = z.number().int().positive().max(100_000_000);

export const outletIdParamSchema = z
  .object({
    outletId: uuidSchema
  })
  .strict();

export const outletMenuParamsSchema = z
  .object({
    outletId: uuidSchema,
    menuItemId: uuidSchema
  })
  .strict();

export const createOutletMenuItemBodySchema = z
  .object({
    menuItemId: uuidSchema,
    priceCents: priceCentsSchema,
    isAvailable: z.boolean().default(true)
  })
  .strict();

export const updateOutletMenuItemBodySchema = z
  .object({
    priceCents: priceCentsSchema.optional(),
    isAvailable: z.boolean().optional()
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required'
  });

export const listOutletMenuItemsQuerySchema = paginationQuerySchema;
