import { z } from 'zod';

export const uuidSchema = z.string().uuid();

export const idParamSchema = z
  .object({
    id: uuidSchema
  })
  .strict();

export const roleSchema = z.enum(['HQ_ADMIN', 'OUTLET_STAFF']);

export const paginationQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20)
  })
  .strict();

export const dateRangeQuerySchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date()
  })
  .strict()
  .refine((value) => value.from <= value.to, {
    message: 'from must be before or equal to to',
    path: ['from']
  });
