import { Prisma } from '@prisma/client';
import type { DbClient } from './types';

export const receiptCounterRepository = {
  async nextNumber(client: DbClient, outletId: string): Promise<number> {
    const rows = await client.$queryRaw<Array<{ receiptNumber: number }>>(Prisma.sql`
      INSERT INTO "receipt_counters" ("outlet_id", "next_number")
      VALUES (${outletId}::uuid, 1)
      ON CONFLICT ("outlet_id")
      DO UPDATE SET "next_number" = "receipt_counters"."next_number" + 1
      RETURNING "next_number" AS "receiptNumber"
    `);

    const row = rows[0];

    if (!row) {
      throw new Error('Receipt counter row not found after update');
    }

    return row.receiptNumber;
  }
};
