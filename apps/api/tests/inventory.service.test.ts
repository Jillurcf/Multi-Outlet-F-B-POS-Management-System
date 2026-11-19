import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestError, NotFoundError } from '../src/errors/AppError';
import { outletInventoryRepository } from '../src/repositories/outletInventory.repository';
import {
  stockMovementRepository,
  type StockMovementRecord
} from '../src/repositories/stockMovement.repository';
import { inventoryService } from '../src/services/inventory.service';

const outletId = '00000000-0000-4000-8000-000000000020';
const outletMenuItemId = '00000000-0000-4000-8000-000000000021';
const actorId = '00000000-0000-4000-8000-000000000025';

const inventoryRecord = {
  id: '00000000-0000-4000-8000-000000000022',
  outletMenuItemId,
  quantity: 12,
  lowStockThreshold: 5,
  updatedAt: new Date(),
  outletMenuItem: {
    id: outletMenuItemId,
    outletId,
    menuItemId: '00000000-0000-4000-8000-000000000023',
    priceCents: 550,
    isAvailable: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    menuItem: {
      id: '00000000-0000-4000-8000-000000000023',
      sku: 'BURGER-01',
      name: 'Burger',
      category: 'Mains',
      description: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  }
};

const movementRecord: StockMovementRecord = {
  id: '00000000-0000-4000-8000-000000000026',
  outletId,
  outletMenuItemId,
  movementType: 'RESTOCK',
  quantityBefore: 7,
  quantityChange: 5,
  quantityAfter: 12,
  actorUserId: actorId,
  saleId: null,
  note: 'Vendor delivery',
  createdAt: new Date(),
  outletMenuItem: inventoryRecord.outletMenuItem
};

test('inventory service maps outlet prices and stock levels', async () => {
  const originalFindMany = outletInventoryRepository.findManyByOutletId;
  const originalCount = outletInventoryRepository.countByOutletId;

  outletInventoryRepository.findManyByOutletId = async () => [inventoryRecord];
  outletInventoryRepository.countByOutletId = async () => 1;

  try {
    const result = await inventoryService.listForOutlet(outletId, 1, 20);

    assert.equal(result.items[0]?.name, 'Burger');
    assert.equal(result.items[0]?.priceCents, 550);
    assert.equal(result.items[0]?.quantity, 12);
  } finally {
    outletInventoryRepository.findManyByOutletId = originalFindMany;
    outletInventoryRepository.countByOutletId = originalCount;
  }
});

test('inventory service adds stock through the outlet-scoped repository', async () => {
  const originalAddStock = outletInventoryRepository.addStock;
  let captured: Parameters<typeof outletInventoryRepository.addStock> | undefined;

  outletInventoryRepository.addStock = async (...args) => {
    captured = args;
    return { ...inventoryRecord, quantity: 17 };
  };

  try {
    const result = await inventoryService.addStockForOutlet(
      outletId,
      outletMenuItemId,
      { quantity: 5, note: '  Vendor delivery  ' },
      actorId
    );

    assert.deepEqual(captured, [outletId, outletMenuItemId, 5, actorId, 'Vendor delivery']);
    assert.equal(result.quantity, 17);
  } finally {
    outletInventoryRepository.addStock = originalAddStock;
  }
});

test('inventory service updates stock with the supplied quantity and actor', async () => {
  const originalUpdateStock = outletInventoryRepository.updateStock;
  let captured: Parameters<typeof outletInventoryRepository.updateStock> | undefined;

  outletInventoryRepository.updateStock = async (...args) => {
    captured = args;
    return { ...inventoryRecord, quantity: 20, lowStockThreshold: 8 };
  };

  try {
    const result = await inventoryService.updateForOutlet(
      outletId,
      outletMenuItemId,
      { quantity: 20, lowStockThreshold: 8 },
      actorId
    );

    assert.deepEqual(captured?.[2], { quantity: 20, lowStockThreshold: 8 });
    assert.equal(captured?.[3], actorId);
    assert.equal(result.quantity, 20);
    assert.equal(result.lowStockThreshold, 8);
  } finally {
    outletInventoryRepository.updateStock = originalUpdateStock;
  }
});

test('inventory updates are rejected when the record belongs to another outlet', async () => {
  const originalUpdateStock = outletInventoryRepository.updateStock;
  outletInventoryRepository.updateStock = async () => null;

  try {
    await assert.rejects(
      () => inventoryService.updateForOutlet(outletId, outletMenuItemId, { quantity: 5 }, actorId),
      NotFoundError
    );
  } finally {
    outletInventoryRepository.updateStock = originalUpdateStock;
  }
});

test('inventory service maps stock movements and passes movement filters', async () => {
  const originalFindMany = stockMovementRepository.findManyByOutletId;
  const originalCount = stockMovementRepository.countByOutletId;
  let capturedFind: Parameters<typeof stockMovementRepository.findManyByOutletId> | undefined;
  let capturedCount: Parameters<typeof stockMovementRepository.countByOutletId> | undefined;

  stockMovementRepository.findManyByOutletId = async (...args) => {
    capturedFind = args;
    return [movementRecord];
  };
  stockMovementRepository.countByOutletId = async (...args) => {
    capturedCount = args;
    return 1;
  };

  try {
    const result = await inventoryService.listMovementsForOutlet(
      outletId,
      outletMenuItemId,
      2,
      10
    );

    assert.deepEqual(capturedFind, [outletId, outletMenuItemId, 10, 10]);
    assert.deepEqual(capturedCount, [outletId, outletMenuItemId]);
    assert.equal(result.items[0]?.sku, 'BURGER-01');
    assert.equal(result.items[0]?.movementType, 'RESTOCK');
    assert.equal(result.items[0]?.quantityChange, 5);
    assert.equal(result.totalPages, 1);
  } finally {
    stockMovementRepository.findManyByOutletId = originalFindMany;
    stockMovementRepository.countByOutletId = originalCount;
  }
});

test('inventory service rejects invalid stock inputs', async () => {
  await assert.rejects(
    () => inventoryService.addStockForOutlet(outletId, outletMenuItemId, { quantity: 0 }, actorId),
    BadRequestError
  );
  await assert.rejects(
    () => inventoryService.updateForOutlet(outletId, outletMenuItemId, {}, actorId),
    BadRequestError
  );
});
