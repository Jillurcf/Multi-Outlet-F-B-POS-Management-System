import { z } from 'zod';
import { uuidSchema } from './common';

export const loginBodySchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(255),
    password: z.string().min(1).max(200)
  })
  .strict();

export const createStaffUserBodySchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(255),
    password: z.string().min(12).max(200),
    fullName: z.string().trim().min(2).max(150),
    outletId: uuidSchema
  })
  .strict();
