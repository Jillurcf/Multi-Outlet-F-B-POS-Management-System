import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NotFoundError } from '../src/errors/AppError';
import { menuItemRepository } from '../src/repositories/menuItem.repository';
import {
  outletMenuItemRepository,
  type CreateOutletMenuItemRecord
} from '../src/repositories/outletMenuItem.repository';
import { outletRepository } from '../src/repositories/outlet.repository';
import { outletMenuService } from '../src/services/outletMenu.service';

const outletId = '00000000-0000-4000-8000-000000000010';
const menuItemId = '00000000-0000-4000-8000-000000000011';

const menuItemRecord = {
  id: menuItemId,
  sku: 'COFFEE-01',
  name: 'Coffee',
  category: 'Beverages',
  description: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date()
};

const assignmentRecord = {
  id: '00000000-0000-4000-8000-000000000012',
  outletId,
  menuItemId,
  priceCents: 350,
  isAvailable: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  menuItem: menuItemRecord,
  inventory: {
    id: '00000000-0000-4000-8000-000000000013',
    outletMenuItemId: '00000000-0000-4000-8000-000000000012',
    quantity: 0,
    lowStockThreshold: 0,
    updatedAt: new Date()
  }
};

test('assignment creates an inventory record with zero stock', async () => {
  const originalFindOutlet = outletRepository.findById;
  const originalFindMenuItem = menuItemRepository.findById;
  const originalCreateAssignment = outletMenuItemRepository.create;
  let captured: CreateOutletMenuItemRecord | undefined;

  outletRepository.findById = async () => ({
    id: outletId,
    code: 'MAIN',
    name: 'Main',
    address: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  });
  menuItemRepository.findById = async () => menuItemRecord;
  outletMenuItemRepository.create = async (data: CreateOutletMenuItemRecord) => {
    captured = data;
    return assignmentRecord;
  };

  try {
    const result = await outletMenuService.assign(outletId, {
      menuItemId,
      priceCents: 350,
      isAvailable: true
    });

    assert.equal(captured?.outletId, outletId);
    assert.equal(captured?.priceCents, 350);
    assert.equal(result.quantity, 0);
    assert.equal(result.priceCents, 350);
  } finally {
    outletRepository.findById = originalFindOutlet;
    menuItemRepository.findById = originalFindMenuItem;
    outletMenuItemRepository.create = originalCreateAssignment;
  }
});

test('staff menu listing only requests available items for the authenticated outlet', async () => {
  const originalFindMany = outletMenuItemRepository.findManyByOutletId;
  const originalCount = outletMenuItemRepository.countByOutletId;
  let onlyAvailable: boolean | undefined;

  outletMenuItemRepository.findManyByOutletId = async (_outletId, _skip, _take, available) => {
    onlyAvailable = available;
    return [assignmentRecord];
  };
  outletMenuItemRepository.countByOutletId = async () => 1;

  try {
    const result = await outletMenuService.listAvailableForOutlet(outletId, 1, 20);

    assert.equal(onlyAvailable, true);
    assert.equal(result.items[0]?.name, 'Coffee');
    assert.equal(result.items[0]?.priceCents, 350);
  } finally {
    outletMenuItemRepository.findManyByOutletId = originalFindMany;
    outletMenuItemRepository.countByOutletId = originalCount;
  }
});

test('assignment update rejects a menu item not assigned to the outlet', async () => {
  const originalFind = outletMenuItemRepository.findByOutletAndMenuItem;
  outletMenuItemRepository.findByOutletAndMenuItem = async () => null;

  try {
    await assert.rejects(
      () => outletMenuService.updateAssignment(outletId, menuItemId, { priceCents: 400 }),
      NotFoundError
    );
  } finally {
    outletMenuItemRepository.findByOutletAndMenuItem = originalFind;
  }
});
