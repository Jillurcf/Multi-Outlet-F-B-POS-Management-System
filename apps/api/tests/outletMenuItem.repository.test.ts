import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prisma } from '../src/config/prisma';
import { outletMenuItemRepository } from '../src/repositories/outletMenuItem.repository';
import type { DbClient } from '../src/repositories/types';

const outletId = '00000000-0000-4000-8000-000000000060';
const itemId = '00000000-0000-4000-8000-000000000061';

interface CapturedSql {
  strings: readonly string[];
  values: readonly unknown[];
}

test('findAssignableByIds restricts candidates to the outlet and active master items', async () => {
  let captured: CapturedSql | undefined;
  const client = {
    $queryRaw: async (query: unknown) => {
      captured = query as CapturedSql;
      return [];
    }
  } as unknown as DbClient;

  const rows = await outletMenuItemRepository.findAssignableByIds(client, outletId, [itemId]);

  assert.deepEqual(rows, []);
  const sql = captured?.strings.join('') ?? '';
  assert.match(sql, /omi\."outlet_id"/);
  assert.match(sql, /omi\."id" IN/);
  assert.match(sql, /mi\."is_active" = TRUE/);
  assert.ok(captured?.values.includes(outletId));
});

test('staff menu queries only include available items assigned to the outlet', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(prisma.outletMenuItem, 'findMany');
  let captured: { where?: unknown; skip?: number; take?: number } | undefined;

  Object.defineProperty(prisma.outletMenuItem, 'findMany', {
    configurable: true,
    writable: true,
    value: async (args: { where?: unknown; skip?: number; take?: number }) => {
      captured = args;
      return [];
    }
  });

  try {
    const rows = await outletMenuItemRepository.findManyByOutletId(outletId, 0, 20, true);
    assert.deepEqual(rows, []);
    assert.deepEqual(captured?.where, {
      outletId,
      isAvailable: true,
      menuItem: { isActive: true }
    });
    assert.equal(captured?.skip, 0);
    assert.equal(captured?.take, 20);
  } finally {
    if (descriptor) {
      Object.defineProperty(prisma.outletMenuItem, 'findMany', descriptor);
    } else {
      delete (prisma.outletMenuItem as unknown as Record<string, unknown>).findMany;
    }
  }
});
