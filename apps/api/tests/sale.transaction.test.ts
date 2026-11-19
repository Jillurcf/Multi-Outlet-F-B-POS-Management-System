import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prisma } from '../src/config/prisma';
import { InsufficientStockError } from '../src/errors/AppError';
import { outletInventoryRepository } from '../src/repositories/outletInventory.repository';
import {
  outletMenuItemRepository,
  type AssignableOutletMenuItemRow
} from '../src/repositories/outletMenuItem.repository';
import { receiptCounterRepository } from '../src/repositories/receiptCounter.repository';
import {
  saleRepository,
  type CreateSaleRecord,
  type SaleRecord
} from '../src/repositories/sale.repository';
import {
  stockMovementRepository,
  type CreateStockMovementRecord
} from '../src/repositories/stockMovement.repository';
import type { DbClient } from '../src/repositories/types';
import { saleService } from '../src/services/sale.service';

const outletId = '00000000-0000-4000-8000-000000000060';
const otherOutletId = '00000000-0000-4000-8000-000000000061';
const cashierId = '00000000-0000-4000-8000-000000000062';
const itemAId = '00000000-0000-4000-8000-000000000063';
const itemBId = '00000000-0000-4000-8000-000000000064';

interface StagedState {
  inventory: Map<string, number>;
  counters: Map<string, number>;
  sales: SaleRecord[];
  movements: CreateStockMovementRecord[];
}

interface RawQuery {
  strings: readonly string[];
  values: unknown[];
}

function inventoryKey(saleOutletId: string, outletMenuItemId: string): string {
  return `${saleOutletId}:${outletMenuItemId}`;
}

function createState(
  quantities: Record<string, number>,
  counters: Record<string, number> = {}
): StagedState {
  return {
    inventory: new Map(Object.entries(quantities)),
    counters: new Map(Object.entries(counters)),
    sales: [],
    movements: []
  };
}

function cloneState(state: StagedState): StagedState {
  return {
    inventory: new Map(state.inventory),
    counters: new Map(state.counters),
    sales: [...state.sales],
    movements: [...state.movements]
  };
}

function commitState(target: StagedState, staged: StagedState): void {
  target.inventory = staged.inventory;
  target.counters = staged.counters;
  target.sales = staged.sales;
  target.movements = staged.movements;
}

function assignmentFor(saleOutletId: string, outletMenuItemId: string): AssignableOutletMenuItemRow | null {
  const isItemA = outletMenuItemId === itemAId;
  const isItemB = outletMenuItemId === itemBId;

  if (!isItemA && !isItemB) {
    return null;
  }

  return {
    outletMenuItemId,
    priceCents: isItemA ? 250 : 500,
    isAvailable: true,
    name: isItemA ? 'Coffee' : 'Burger',
    sku: isItemA ? 'COFFEE' : 'BURGER'
  };
}

function makeId(seed: number): string {
  return `00000000-0000-4000-8000-${String(seed).padStart(12, '0')}`;
}

function makeSaleRecord(data: CreateSaleRecord, seed: number): SaleRecord {
  const id = makeId(seed);

  return {
    id,
    outletId: data.outletId,
    cashierId: data.cashierId,
    receiptNumber: data.receiptNumber,
    totalCents: data.totalCents,
    idempotencyKey: data.idempotencyKey ?? null,
    createdAt: new Date('2026-01-02T10:00:00.000Z'),
    outlet: {
      id: data.outletId,
      code: data.outletId === outletId ? 'MAIN' : 'NORTH',
      name: data.outletId === outletId ? 'Main Outlet' : 'North Outlet',
      address: null,
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z')
    },
    cashier: { fullName: 'Cashier One' },
    saleItems: data.items.map((item, index) => ({
      id: makeId(1000 + seed * 10 + index),
      saleId: id,
      outletMenuItemId: item.outletMenuItemId,
      menuItemName: item.menuItemName,
      menuItemSku: item.menuItemSku,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      lineTotalCents: item.lineTotalCents
    }))
  } as SaleRecord;
}

function uniqueConstraintError(): Error {
  const error = new Error('unique constraint violation') as Error & { code: string };
  error.code = 'P2002';
  return error;
}

let createFailure: Error | null = null;
let idempotencyLookupOverride:
  | ((client: DbClient, saleOutletId: string, key: string) => Promise<SaleRecord | null>)
  | null = null;

function installRepositories(state: StagedState): () => void {
  const originalFindAssignable = outletMenuItemRepository.findAssignableByIds;
  const originalDeduct = outletInventoryRepository.deductStock;
  const originalNextNumber = receiptCounterRepository.nextNumber;
  const originalFindByIdempotencyKey = saleRepository.findByIdempotencyKey;
  const originalCreate = saleRepository.create;
  const originalCreateMovements = stockMovementRepository.createMany;

  createFailure = null;
  idempotencyLookupOverride = null;

  outletMenuItemRepository.findAssignableByIds = async (_client, saleOutletId, ids) =>
    ids
      .map((id) => assignmentFor(saleOutletId, id))
      .filter((assignment): assignment is AssignableOutletMenuItemRow => assignment !== null);

  outletInventoryRepository.deductStock = async (
    tx,
    saleOutletId,
    outletMenuItemId,
    quantity
  ) => {
    const staged = tx as unknown as StagedState;
    const key = inventoryKey(saleOutletId, outletMenuItemId);
    const current = staged.inventory.get(key);

    if (current === undefined || current < quantity) {
      return null;
    }

    const remaining = current - quantity;
    staged.inventory.set(key, remaining);
    return remaining;
  };

  receiptCounterRepository.nextNumber = async (tx, saleOutletId) => {
    const staged = tx as unknown as StagedState;
    const next = (staged.counters.get(saleOutletId) ?? 0) + 1;
    staged.counters.set(saleOutletId, next);
    return next;
  };

  saleRepository.findByIdempotencyKey = async (client, saleOutletId, key) => {
    const lookupClient = client ?? prisma;

    if (idempotencyLookupOverride) {
      return idempotencyLookupOverride(lookupClient, saleOutletId, key);
    }

    const source = (lookupClient === prisma ? state : lookupClient) as unknown as StagedState;
    return (
      source.sales.find(
        (sale) => sale.outletId === saleOutletId && sale.idempotencyKey === key
      ) ?? null
    );
  };

  saleRepository.create = async (tx, data) => {
    if (createFailure) {
      throw createFailure;
    }

    const staged = tx as unknown as StagedState;
    const duplicateInStaged = staged.sales.some(
      (sale) =>
        sale.outletId === data.outletId &&
        (sale.receiptNumber === data.receiptNumber ||
          (data.idempotencyKey !== null &&
            data.idempotencyKey !== undefined &&
            sale.idempotencyKey === data.idempotencyKey))
    );
    const duplicateInCommitted = state.sales.some(
      (sale) =>
        sale.outletId === data.outletId &&
        (sale.receiptNumber === data.receiptNumber ||
          (data.idempotencyKey !== null &&
            data.idempotencyKey !== undefined &&
            sale.idempotencyKey === data.idempotencyKey))
    );

    if (duplicateInStaged || duplicateInCommitted) {
      throw uniqueConstraintError();
    }

    const record = makeSaleRecord(data, staged.sales.length + 1);
    staged.sales.push(record);
    return record;
  };

  stockMovementRepository.createMany = async (tx, data) => {
    const staged = tx as unknown as StagedState;
    staged.movements.push(...data);
    return data.length;
  };

  return () => {
    outletMenuItemRepository.findAssignableByIds = originalFindAssignable;
    outletInventoryRepository.deductStock = originalDeduct;
    receiptCounterRepository.nextNumber = originalNextNumber;
    saleRepository.findByIdempotencyKey = originalFindByIdempotencyKey;
    saleRepository.create = originalCreate;
    stockMovementRepository.createMany = originalCreateMovements;
    createFailure = null;
    idempotencyLookupOverride = null;
  };
}

function installTransactionMock(state: StagedState, serialize: boolean): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(prisma, '$transaction');
  let queue: Promise<unknown> = Promise.resolve();

  Object.defineProperty(prisma, '$transaction', {
    configurable: true,
    writable: true,
    value: <T>(callback: (tx: DbClient) => Promise<T>, _options?: unknown): Promise<T> => {
      const run = async (): Promise<T> => {
        const staged = cloneState(state);
        const result = await callback(staged as unknown as DbClient);
        commitState(state, staged);
        return result;
      };

      if (!serialize) {
        return run();
      }

      const queued = queue.then(run, run);
      queue = queued.then(
        () => undefined,
        () => undefined
      );
      return queued;
    }
  });

  return () => {
    if (descriptor) {
      Object.defineProperty(prisma, '$transaction', descriptor);
    } else {
      delete (prisma as unknown as Record<string, unknown>).$transaction;
    }
  };
}

test('transaction rollback keeps stock, receipt counter, sale and movements unchanged', async () => {
  const state = createState({
    [inventoryKey(outletId, itemAId)]: 5,
    [inventoryKey(outletId, itemBId)]: 3
  });
  const restoreRepositories = installRepositories(state);
  const restoreTransaction = installTransactionMock(state, false);
  createFailure = new Error('sale insert failed');

  try {
    await assert.rejects(
      () =>
        saleService.createSale(outletId, cashierId, [
          { outletMenuItemId: itemAId, quantity: 1 },
          { outletMenuItemId: itemBId, quantity: 2 }
        ]),
      /sale insert failed/
    );

    assert.equal(state.inventory.get(inventoryKey(outletId, itemAId)), 5);
    assert.equal(state.inventory.get(inventoryKey(outletId, itemBId)), 3);
    assert.equal(state.counters.get(outletId), undefined);
    assert.equal(state.sales.length, 0);
    assert.equal(state.movements.length, 0);
  } finally {
    restoreTransaction();
    restoreRepositories();
  }
});

test('concurrent sales never oversell stock and only one succeeds when stock is short', async () => {
  const state = createState({ [inventoryKey(outletId, itemAId)]: 1 });
  const restoreRepositories = installRepositories(state);
  const restoreTransaction = installTransactionMock(state, true);

  try {
    const results = await Promise.allSettled([
      saleService.createSale(outletId, cashierId, [{ outletMenuItemId: itemAId, quantity: 1 }]),
      saleService.createSale(outletId, cashierId, [{ outletMenuItemId: itemAId, quantity: 1 }])
    ]);

    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
    const rejected = results.find((result) => result.status === 'rejected');
    assert.ok(rejected?.status === 'rejected');
    assert.ok(rejected.reason instanceof InsufficientStockError);
    assert.equal(state.inventory.get(inventoryKey(outletId, itemAId)), 0);
    assert.equal(state.sales.length, 1);
    assert.equal(state.counters.get(outletId), 1);
    assert.equal(state.movements.length, 1);
  } finally {
    restoreTransaction();
    restoreRepositories();
  }
});

test('concurrent receipt generation produces unique sequential receipt numbers', async () => {
  const state = createState({ [inventoryKey(outletId, itemAId)]: 10 });
  const restoreRepositories = installRepositories(state);
  const restoreTransaction = installTransactionMock(state, true);

  try {
    const sales = await Promise.all(
      [0, 1, 2].map(() =>
        saleService.createSale(outletId, cashierId, [{ outletMenuItemId: itemAId, quantity: 1 }])
      )
    );

    assert.deepEqual(
      sales.map((sale) => sale.receiptNumber).sort((left, right) => left - right),
      [1, 2, 3]
    );
    assert.equal(new Set(sales.map((sale) => sale.id)).size, 3);
    assert.equal(state.counters.get(outletId), 3);
  } finally {
    restoreTransaction();
    restoreRepositories();
  }
});

test('duplicate idempotency keys return the original sale without double deducting stock', async () => {
  const state = createState({ [inventoryKey(outletId, itemAId)]: 5 });
  const restoreRepositories = installRepositories(state);
  const restoreTransaction = installTransactionMock(state, true);

  try {
    const [first, second] = await Promise.all([
      saleService.createSale(
        outletId,
        cashierId,
        [{ outletMenuItemId: itemAId, quantity: 1 }],
        'checkout-1'
      ),
      saleService.createSale(
        outletId,
        cashierId,
        [{ outletMenuItemId: itemAId, quantity: 1 }],
        'checkout-1'
      )
    ]);

    assert.equal(first.id, second.id);
    assert.equal(first.receiptNumber, second.receiptNumber);
    assert.equal(state.inventory.get(inventoryKey(outletId, itemAId)), 4);
    assert.equal(state.counters.get(outletId), 1);
    assert.equal(state.sales.length, 1);
    assert.equal(state.movements.length, 1);
  } finally {
    restoreTransaction();
    restoreRepositories();
  }
});

test('duplicate key race rolls back the losing sale and returns the committed sale', async () => {
  const state = createState({ [inventoryKey(outletId, itemAId)]: 5 }, { [outletId]: 7 });
  const committed = makeSaleRecord(
    {
      outletId,
      cashierId,
      receiptNumber: 7,
      totalCents: 250,
      idempotencyKey: 'checkout-race',
      items: [
        {
          outletMenuItemId: itemAId,
          menuItemName: 'Coffee',
          menuItemSku: 'COFFEE',
          quantity: 1,
          unitPriceCents: 250,
          lineTotalCents: 250
        }
      ]
    },
    1
  );
  state.sales.push(committed);
  state.movements.push({
    outletId,
    outletMenuItemId: itemAId,
    movementType: 'SALE',
    quantityBefore: 5,
    quantityChange: -1,
    quantityAfter: 4,
    actorUserId: cashierId,
    saleId: committed.id
  });
  state.inventory.set(inventoryKey(outletId, itemAId), 4);

  const restoreRepositories = installRepositories(state);
  const restoreTransaction = installTransactionMock(state, false);
  idempotencyLookupOverride = async (client) => (client === prisma ? committed : null);

  try {
    const result = await saleService.createSale(
      outletId,
      cashierId,
      [{ outletMenuItemId: itemAId, quantity: 1 }],
      'checkout-race'
    );

    assert.equal(result.id, committed.id);
    assert.equal(result.receiptNumber, 7);
    assert.equal(state.inventory.get(inventoryKey(outletId, itemAId)), 4);
    assert.equal(state.counters.get(outletId), 7);
    assert.equal(state.sales.length, 1);
    assert.equal(state.movements.length, 1);
  } finally {
    restoreTransaction();
    restoreRepositories();
  }
});

test('the same idempotency key creates separate sales at different outlets', async () => {
  const state = createState({
    [inventoryKey(outletId, itemAId)]: 5,
    [inventoryKey(otherOutletId, itemAId)]: 5
  });
  const restoreRepositories = installRepositories(state);
  const restoreTransaction = installTransactionMock(state, true);

  try {
    const [first, second] = await Promise.all([
      saleService.createSale(
        outletId,
        cashierId,
        [{ outletMenuItemId: itemAId, quantity: 1 }],
        'shared-key'
      ),
      saleService.createSale(
        otherOutletId,
        cashierId,
        [{ outletMenuItemId: itemAId, quantity: 1 }],
        'shared-key'
      )
    ]);

    assert.notEqual(first.id, second.id);
    assert.equal(first.receiptNumber, 1);
    assert.equal(second.receiptNumber, 1);
    assert.equal(state.inventory.get(inventoryKey(outletId, itemAId)), 4);
    assert.equal(state.inventory.get(inventoryKey(otherOutletId, itemAId)), 4);
    assert.equal(state.sales.length, 2);
  } finally {
    restoreTransaction();
    restoreRepositories();
  }
});

test('receiptCounterRepository uses one atomic upsert under concurrent calls', async () => {
  let nextNumber = 0;
  let queue: Promise<unknown> = Promise.resolve();
  const client = {
    $queryRaw: async (query: unknown) => {
      const run = queue.then(async () => {
        const sql = query as RawQuery;
        const text = sql.strings.join(' ');
        assert.ok(text.includes('INSERT INTO "receipt_counters"'));
        assert.ok(text.includes('ON CONFLICT ("outlet_id")'));
        assert.ok(
          text.includes('DO UPDATE SET "next_number" = "receipt_counters"."next_number" + 1')
        );
        assert.deepEqual(sql.values, [outletId]);
        nextNumber += 1;
        return [{ receiptNumber: nextNumber }];
      });

      queue = run.then(
        () => undefined,
        () => undefined
      );
      return run;
    }
  } as unknown as DbClient;

  const results = await Promise.all(
    [0, 1, 2].map(() => receiptCounterRepository.nextNumber(client, outletId))
  );

  assert.deepEqual(results.sort((left, right) => left - right), [1, 2, 3]);
});

test('deductStock uses a guarded atomic update and never permits negative stock', async () => {
  let quantity = 1;
  let queue: Promise<unknown> = Promise.resolve();
  const client = {
    $queryRaw: async (query: unknown) => {
      const run = queue.then(async () => {
        const sql = query as RawQuery;
        const text = sql.strings.join(' ');
        assert.ok(text.includes('UPDATE "outlet_inventory" AS oi'));
        assert.ok(text.includes('AND oi."quantity" >='));
        assert.deepEqual(sql.values, [1, outletId, itemAId, 1]);

        if (quantity < 1) {
          return [];
        }

        quantity -= 1;
        return [{ id: 'inventory-id', quantity }];
      });

      queue = run.then(
        () => undefined,
        () => undefined
      );
      return run;
    }
  } as unknown as DbClient;

  const results = await Promise.all([
    outletInventoryRepository.deductStock(client, outletId, itemAId, 1),
    outletInventoryRepository.deductStock(client, outletId, itemAId, 1)
  ]);

  assert.equal(results.filter((result) => result !== null).length, 1);
  assert.equal(results.find((result) => result !== null), 0);
  assert.equal(quantity, 0);
});
