import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const isTest = process.env.NODE_ENV === 'test' || process.env.npm_lifecycle_event === 'test';
const isProduction = process.env.NODE_ENV === 'production';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: isTest
    ? z.string().default('postgresql://test:test@localhost:5432/pos_test?schema=public')
    : z.string().url(),
  JWT_SECRET: isTest
    ? z.string().default('test-jwt-secret-with-at-least-32-characters')
    : z.string().min(32, 'JWT_SECRET must contain at least 32 characters'),
  JWT_EXPIRES_IN: z
    .string()
    .regex(/^\d+(s|m|h|d)$/, 'JWT_EXPIRES_IN must look like 60s, 15m, 12h or 1d')
    .default('1d'),
  CORS_ORIGIN: isProduction
    ? z.string().url()
    : z.string().url().default('http://localhost:5173')
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`);
}

export const env = Object.freeze(parsed.data);
