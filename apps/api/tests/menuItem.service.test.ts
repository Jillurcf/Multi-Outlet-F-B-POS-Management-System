import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  menuItemRepository,
  type CreateMenuItemRecord
} from '../src/repositories/menuItem.repository';
import { menuItemService } from '../src/services/menuItem.service';

const menuItemRecord = {
  id: '00000000-0000-4000-8000-000000000003',
  sku: 'COFFEE-01',
  name: 'Coffee',
  category: 'Beverages',
  description: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date()
};

test('menu item service normalizes sku on create', async () => {
  const original = menuItemRepository.create;
  let captured: CreateMenuItemRecord | undefined;

  menuItemRepository.create = async (data: CreateMenuItemRecord) => {
    captured = data;
    return menuItemRecord;
  };

  try {
    const result = await menuItemService.create({
      sku: ' coffee-01 ',
      name: 'Coffee',
      category: 'Beverages',
      description: '  '
    });

    assert.equal(captured?.sku, 'COFFEE-01');
    assert.equal(captured?.description, null);
    assert.equal(result.sku, 'COFFEE-01');
  } finally {
    menuItemRepository.create = original;
  }
});
