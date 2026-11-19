import { z } from 'zod';
import { paginationQuerySchema } from './common';

const outletCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(50)
  .regex(/^[A-Za-z0-9_-]+$/, 'code may only contain letters, numbers, underscores and hyphens');

export const createOutletBodySchema = z
  .object({
    code: outletCodeSchema,
    name: z.string().trim().min(2).max(150),
    address: z.string().trim().max(255).nullish()
  })
  .strict();

export const updateOutletBodySchema = createOutletBodySchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'At least one field is required' }
);

export const listOutletsQuerySchema = paginationQuerySchema;
