import { z } from 'zod';
import { paginationQuerySchema } from './common';

const menuItemSkuSchema = z
  .string()
  .trim()
  .min(2)
  .max(50)
  .regex(/^[A-Za-z0-9_-]+$/, 'sku may only contain letters, numbers, underscores and hyphens');

export const createMenuItemBodySchema = z
  .object({
    sku: menuItemSkuSchema,
    name: z.string().trim().min(2).max(150),
    category: z.string().trim().min(2).max(100),
    description: z.string().trim().max(1000).nullish()
  })
  .strict();

export const updateMenuItemBodySchema = createMenuItemBodySchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'At least one field is required' }
);

export const listMenuItemsQuerySchema = paginationQuerySchema;
