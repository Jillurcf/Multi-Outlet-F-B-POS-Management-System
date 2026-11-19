import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prisma } from '../src/config/prisma';
import {
  BadRequestError,
  ConflictError,
  InsufficientStockError,
  NotFoundError
} from '../src/errors/AppError';
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

const outletId = '00000000-0000-4000-8000-000000000020';
const cashierId = '00000000-0000-4000-8000-000000000021';
const itemAId = '00000000-0000-4000-8000-000000000022';
const itemBId = '00000000-0000-4000-8000-000000000023';
const saleId = '00000000-0000-4000-8000-000000000024';

const assignments: AssignableOutletMenuItemRow[] = [
  { outletMenuItemId: itemBId, priceCents: 500, isAvailable: true, name: 'Burger', sku: 'BURGER' },
  { outletMenuItemId: itemAId, priceCents: 250, isAvailable: true, name: 'Coffee', sku: 'COFFEE' }
];

const saleRecord = {
  id: saleId,
  outletId,
  cashierId,
  receiptNumber: 7,
  totalCents: 1000,
  idempotencyKey: null,
  createdAt: new Date('2026-01-02T10:00:00.000Z'),
  outlet: {
    id: outletId,
    code: 'MAIN',
    name: 'Main',
    address: null,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z')
  },
  cashier: { fullName: 'Cashier One' },
  saleItems: [
    {
      id: '00000000-0000-4000-8000-000000000025',
      saleId,
      outletMenuItemId: itemAId,
      menuItemName: 'Coffee',
      menuItemSku: 'COFFEE',
      quantity: 2,
      unitPriceCents: 250,
      lineTotalCents: 500
    },
    {
      id: '00000000-0000-4000-8000-000000000026',
      saleId,
      outletMenuItemId: itemBId,
      menuItemName: 'Burger',
      menuItemSku: 'BURGER',
      quantity: 1,
      unitPriceCents: 500,
      lineTotalCents: 500
    }
  ]
} as SaleRecord;

async function withTransactionMock<T>(run: () => Promise<T>): Promise<T> {
  const descriptor = Object.getOwnPropertyDescriptor(prisma, '$transaction');

  Object.defineProperty(prisma, '$transaction', {
    configurable: true,
    writable: true,
    value: <U>(callback: (tx: DbClient) => Promise<U>, _options?: unknown): Promise<U> =>
      callback({} as DbClient)
  });

  try {
    return await run();
  } finally {
    if (descriptor) {
      Object.defineProperty(prisma, '$transaction', descriptor);
    } else {
      delete (prisma as unknown as Record<string, unknown>).$transaction;
    }
  }
}

test('createSale deducts stock in sorted order and saves a priced sale', async () => {
  const originalFindAssignable = outletMenuItemRepository.findAssignableByIds;
  const originalDeduct = outletInventoryRepository.deductStock;
  const originalNextNumber = receiptCounterRepository.nextNumber;
  const originalCreate = saleRepository.create;
  const originalCreateMovements = stockMovementRepository.createMany;
  const deducted: string[] = [];
  let capturedCreate: CreateSaleRecord | undefined;
  let capturedMovements: CreateStockMovementRecord[] = [];

  try {
    await withTransactionMock(async () => {
      stockMovementRepository.createMany = async (_client, data) => {
        capturedMovements = data;
        return data.length;
      };
      outletMenuItemRepository.findAssignableByIds = async () => assignments;
      outletInventoryRepository.deductStock = async (
        _client,
        _outletId,
        outletMenuItemId
      ) => {
        deducted.push(outletMenuItemId);
        return 10;
      };
      receiptCounterRepository.nextNumber = async () => 7;
      saleRepository.create = async (_client, data) => {
        capturedCreate = data;
        return saleRecord;
      };

      const result = await saleService.createSale(outletId, cashierId, [
        { outletMenuItemId: itemBId, quantity: 1 },
        { outletMenuItemId: itemAId, quantity: 2 }
      ]);

      assert.deepEqual(deducted, [itemAId, itemBId]);
      assert.equal(capturedCreate?.receiptNumber, 7);
      assert.equal(capturedCreate?.totalCents, 1000);
      assert.equal(capturedCreate?.items[0]?.menuItemName, 'Coffee');
      assert.equal(capturedCreate?.items[0]?.menuItemSku, 'COFFEE');
      assert.equal(capturedCreate?.items[0]?.unitPriceCents, 250);
      assert.equal(capturedCreate?.items[0]?.lineTotalCents, 500);
      assert.equal(result.cashierName, 'Cashier One');
      assert.equal(result.receiptNumber, 7);
      assert.equal(capturedMovements.length, 2);
      assert.equal(capturedMovements[0]?.movementType, 'SALE');
      assert.equal(capturedMovements[0]?.saleId, saleId);
      assert.equal(capturedMovements[0]?.quantityChange, -2);
      assert.equal(capturedMovements[0]?.quantityBefore, 12);
      assert.equal(capturedMovements[0]?.quantityAfter, 10);
    });
  } finally {
    outletMenuItemRepository.findAssignableByIds = originalFindAssignable;
    outletInventoryRepository.deductStock = originalDeduct;
    receiptCounterRepository.nextNumber = originalNextNumber;
    saleRepository.create = originalCreate;
    stockMovementRepository.createMany = originalCreateMovements;
  }
});

test('createSale rejects menu items that are not assigned to the outlet', async () => {
  const originalFindAssignable = outletMenuItemRepository.findAssignableByIds;
  const originalDeduct = outletInventoryRepository.deductStock;
  const originalNextNumber = receiptCounterRepository.nextNumber;
  const originalCreate = saleRepository.create;
  const originalCreateMovements = stockMovementRepository.createMany;
  let checkedOutlet: string | undefined;
  let deducted = false;
  let nextNumberCalled = false;
  let createCalled = false;
  let movementsCalled = false;

  try {
    await withTransactionMock(async () => {
      stockMovementRepository.createMany = async () => {
        movementsCalled = true;
        return 0;
      };
      outletMenuItemRepository.findAssignableByIds = async (_client, outletId, _ids) => {
        checkedOutlet = outletId;
        return [];
      };
      outletInventoryRepository.deductStock = async () => {
        deducted = true;
        return 10;
      };
      receiptCounterRepository.nextNumber = async () => {
        nextNumberCalled = true;
        return 7;
      };
      saleRepository.create = async () => {
        createCalled = true;
        return saleRecord;
      };

      await assert.rejects(
        () => saleService.createSale(outletId, cashierId, [{ outletMenuItemId: itemAId, quantity: 1 }]),
        BadRequestError
      );
    });

    assert.equal(checkedOutlet, outletId);
    assert.equal(deducted, false);
    assert.equal(nextNumberCalled, false);
    assert.equal(createCalled, false);
    assert.equal(movementsCalled, false);
  } finally {
    outletMenuItemRepository.findAssignableByIds = originalFindAssignable;
    outletInventoryRepository.deductStock = originalDeduct;
    receiptCounterRepository.nextNumber = originalNextNumber;
    saleRepository.create = originalCreate;
    stockMovementRepository.createMany = originalCreateMovements;
  }
});

test('createSale rejects insufficient stock before creating a sale', async () => {
  const originalFindAssignable = outletMenuItemRepository.findAssignableByIds;
  const originalDeduct = outletInventoryRepository.deductStock;
  const originalNextNumber = receiptCounterRepository.nextNumber;
  const originalCreate = saleRepository.create;
  const originalCreateMovements = stockMovementRepository.createMany;
  let nextNumberCalled = false;
  let createCalled = false;
  let movementsCalled = false;

  try {
    await withTransactionMock(async () => {
      stockMovementRepository.createMany = async () => {
        movementsCalled = true;
        return 0;
      };
      outletMenuItemRepository.findAssignableByIds = async () => [assignments[0]!];
      outletInventoryRepository.deductStock = async () => null;
      receiptCounterRepository.nextNumber = async () => {
        nextNumberCalled = true;
        return 7;
      };
      saleRepository.create = async () => {
        createCalled = true;
        return saleRecord;
      };

      await assert.rejects(
        () =>
          saleService.createSale(outletId, cashierId, [
            { outletMenuItemId: itemBId, quantity: 1 }
          ]),
        InsufficientStockError
      );

      assert.equal(nextNumberCalled, false);
      assert.equal(createCalled, false);
      assert.equal(movementsCalled, false);
    });
  } finally {
    outletMenuItemRepository.findAssignableByIds = originalFindAssignable;
    outletInventoryRepository.deductStock = originalDeduct;
    receiptCounterRepository.nextNumber = originalNextNumber;
    saleRepository.create = originalCreate;
    stockMovementRepository.createMany = originalCreateMovements;
  }
});

test('createSale rejects unavailable items without deducting stock', async () => {
  const originalFindAssignable = outletMenuItemRepository.findAssignableByIds;
  const originalDeduct = outletInventoryRepository.deductStock;
  const originalCreateMovements = stockMovementRepository.createMany;
  let deductCalled = false;
  let movementsCalled = false;

  try {
    await withTransactionMock(async () => {
      stockMovementRepository.createMany = async () => {
        movementsCalled = true;
        return 0;
      };
      outletMenuItemRepository.findAssignableByIds = async () => [
        { ...assignments[0]!, isAvailable: false }
      ];
      outletInventoryRepository.deductStock = async () => {
        deductCalled = true;
        return 10;
      };

      await assert.rejects(
        () =>
          saleService.createSale(outletId, cashierId, [
            { outletMenuItemId: itemBId, quantity: 1 }
          ]),
        ConflictError
      );

      assert.equal(deductCalled, false);
      assert.equal(movementsCalled, false);
    });
  } finally {
    outletMenuItemRepository.findAssignableByIds = originalFindAssignable;
    outletInventoryRepository.deductStock = originalDeduct;
    stockMovementRepository.createMany = originalCreateMovements;
  }
});

test('createSale rejects invalid quantities before touching inventory', async () => {
  const originalFindAssignable = outletMenuItemRepository.findAssignableByIds;
  const originalDeduct = outletInventoryRepository.deductStock;
  let findCalled = false;
  let deductCalled = false;

  try {
    await withTransactionMock(async () => {
      outletMenuItemRepository.findAssignableByIds = async () => {
        findCalled = true;
        return assignments;
      };
      outletInventoryRepository.deductStock = async () => {
        deductCalled = true;
        return 10;
      };

      await assert.rejects(
        () => saleService.createSale(outletId, cashierId, [{ outletMenuItemId: itemAId, quantity: 0 }]),
        BadRequestError
      );
    });

    assert.equal(findCalled, false);
    assert.equal(deductCalled, false);
  } finally {
    outletMenuItemRepository.findAssignableByIds = originalFindAssignable;
    outletInventoryRepository.deductStock = originalDeduct;
  }
});

test('createSale rejects an invalid outlet price before deducting stock', async () => {
  const originalFindAssignable = outletMenuItemRepository.findAssignableByIds;
  const originalDeduct = outletInventoryRepository.deductStock;
  const originalNextNumber = receiptCounterRepository.nextNumber;
  const originalCreate = saleRepository.create;
  let deductCalled = false;
  let nextNumberCalled = false;
  let createCalled = false;

  try {
    await withTransactionMock(async () => {
      outletMenuItemRepository.findAssignableByIds = async () => [
        { ...assignments[0]!, priceCents: 0 }
      ];
      outletInventoryRepository.deductStock = async () => {
        deductCalled = true;
        return 10;
      };
      receiptCounterRepository.nextNumber = async () => {
        nextNumberCalled = true;
        return 7;
      };
      saleRepository.create = async () => {
        createCalled = true;
        return saleRecord;
      };

      await assert.rejects(
        () => saleService.createSale(outletId, cashierId, [{ outletMenuItemId: itemAId, quantity: 1 }]),
        BadRequestError
      );
    });

    assert.equal(deductCalled, false);
    assert.equal(nextNumberCalled, false);
    assert.equal(createCalled, false);
  } finally {
    outletMenuItemRepository.findAssignableByIds = originalFindAssignable;
    outletInventoryRepository.deductStock = originalDeduct;
    receiptCounterRepository.nextNumber = originalNextNumber;
    saleRepository.create = originalCreate;
  }
});

test('listForOutlet scopes history to the authenticated outlet', async () => {
  const originalFindMany = saleRepository.findManyByOutletId;
  const originalCount = saleRepository.countByOutletId;
  let capturedSkip: number | undefined;
  let capturedTake: number | undefined;

  saleRepository.findManyByOutletId = async (_client, _outletId, skip, take) => {
    capturedSkip = skip;
    capturedTake = take;
    return [saleRecord];
  };
  saleRepository.countByOutletId = async () => 6;

  try {
    const result = await saleService.listForOutlet(outletId, 2, 5);

    assert.equal(capturedSkip, 5);
    assert.equal(capturedTake, 5);
    assert.equal(result.totalPages, 2);
    assert.equal(result.items[0]?.outletId, outletId);
  } finally {
    saleRepository.findManyByOutletId = originalFindMany;
    saleRepository.countByOutletId = originalCount;
  }
});

test('getReceiptForOutlet returns a receipt for an outlet-scoped sale', async () => {
  const originalFind = saleRepository.findByIdForOutlet;
  let captured: { saleId: string; outletId: string } | undefined;

  saleRepository.findByIdForOutlet = async (_client, saleId, outletId) => {
    captured = { saleId, outletId };
    return saleRecord;
  };

  try {
    const result = await saleService.getReceiptForOutlet(saleId, outletId);

    assert.deepEqual(captured, { saleId, outletId });
    assert.equal(result.receiptTitle, 'Receipt #7');
  } finally {
    saleRepository.findByIdForOutlet = originalFind;
  }

  saleRepository.findByIdForOutlet = async () => null;

  try {
    await assert.rejects(
      () => saleService.getReceiptForOutlet(saleId, outletId),
      NotFoundError
    );
  } finally {
    saleRepository.findByIdForOutlet = originalFind;
  }
});
