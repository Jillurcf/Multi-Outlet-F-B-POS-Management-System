import { z } from 'zod';
import { paginationQuerySchema, uuidSchema } from './common';

const saleItemInputSchema = z
  .object({
    outletMenuItemId: uuidSchema,
    quantity: z.number().int().positive().max(1_000)
  })
  .strict();

export const createSaleBodySchema = z
  .object({
    items: z.array(saleItemInputSchema).min(1).max(50)
  })
  .strict()
  .superRefine((value, ctx) => {
    const ids = value.items.map((item) => item.outletMenuItemId);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Duplicate items are not allowed',
        path: ['items']
      });
    }
  });

export const idempotencyKeyHeaderSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9._:-]+$/);

export const createSaleHeadersSchema = z.object({
  'idempotency-key': idempotencyKeyHeaderSchema.optional()
});

export const saleIdParamSchema = z
  .object({
    saleId: uuidSchema
  })
  .strict();

export const listSalesQuerySchema = paginationQuerySchema;
