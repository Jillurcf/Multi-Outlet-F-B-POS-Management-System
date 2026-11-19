import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import type {
  ApiErrorBody,
  LoginResponse,
  OutletInventoryDto,
  SaleDto,
  StockMovementDto
} from '@pos/shared';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app';
import { prisma } from '../src/config/prisma';
import { toSaleDto } from '../src/mappers/sale.mapper';
import { outletInventoryRepository, type OutletInventoryRecord } from '../src/repositories/outletInventory.repository';
import { outletMenuItemRepository } from '../src/repositories/outletMenuItem.repository';
import { outletRepository } from '../src/repositories/outlet.repository';
import { receiptCounterRepository } from '../src/repositories/receiptCounter.repository';
import { reportingRepository } from '../src/repositories/reporting.repository';
import { saleRepository, type SaleRecord } from '../src/repositories/sale.repository';
import {
  stockMovementRepository,
  type StockMovementRecord
} from '../src/repositories/stockMovement.repository';
import type { DbClient } from '../src/repositories/types';
import { userRepository } from '../src/repositories/user.repository';
import { saleService } from '../src/services/sale.service';

const outletA = '00000000-0000-4000-8000-000000000040';
const outletB = '00000000-0000-4000-8000-000000000041';
const itemA = '00000000-0000-4000-8000-000000000042';
const itemB = '00000000-0000-4000-8000-000000000043';
const saleA = '00000000-0000-4000-8000-000000000044';
const saleB = '00000000-0000-4000-8000-000000000045';
const menuItemA = '00000000-0000-4000-8000-000000000046';

const passwordHash = bcrypt.hashSync('correct-password', 10);

const staffA = {
  id: '00000000-0000-4000-8000-000000000047',
  email: 'staff-a@example.com',
  passwordHash,
  fullName: 'Staff A',
  role: 'OUTLET_STAFF' as const,
  outletId: outletA,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date()
};

const staffB = {
  ...staffA,
  id: '00000000-0000-4000-8000-000000000048',
  email: 'staff-b@example.com',
  fullName: 'Staff B',
  outletId: outletB
};

const usersByEmail = new Map([
  [staffA.email, staffA],
  [staffB.email, staffB]
]);
const usersById = new Map([
  [staffA.id, staffA],
  [staffB.id, staffB]
]);

const inventoryRecord: OutletInventoryRecord = {
  id: '00000000-0000-4000-8000-000000000049',
  outletMenuItemId: itemA,
  quantity: 9,
  lowStockThreshold: 3,
  updatedAt: new Date(),
  outletMenuItem: {
    id: itemA,
    outletId: outletA,
    menuItemId: menuItemA,
    priceCents: 550,
    isAvailable: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    menuItem: {
      id: menuItemA,
      sku: 'COFFEE',
      name: 'Coffee',
      category: 'Drinks',
      description: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  }
};

const saleRecord: SaleRecord = {
  id: saleA,
  outletId: outletA,
  cashierId: staffA.id,
  receiptNumber: 7,
  totalCents: 550,
  idempotencyKey: null,
  createdAt: new Date(),
  outlet: {
    id: outletA,
    code: 'MAIN',
    name: 'Main Outlet',
    address: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  cashier: { fullName: staffA.fullName },
  saleItems: [
    {
      id: '00000000-0000-4000-8000-000000000050',
      saleId: saleA,
      outletMenuItemId: itemA,
      menuItemName: 'Coffee',
      menuItemSku: 'COFFEE',
      quantity: 1,
      unitPriceCents: 550,
      lineTotalCents: 550
    }
  ]
};

const outletRecord = {
  id: outletA,
  code: 'MAIN',
  name: 'Main Outlet',
  address: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date()
};

const originalFindByEmail = userRepository.findByEmail;
const originalFindById = userRepository.findById;

let server: Server;
let baseUrl: string;
let tokenA: string;
let tokenB: string;

function stub<T extends object, K extends keyof T>(target: T, key: K, replacement: T[K]): () => void {
  const original = target[key];
  target[key] = replacement;
  return () => {
    target[key] = original;
  };
}

async function withTransactionMock<T>(run: () => Promise<T>): Promise<T> {
  const descriptor = Object.getOwnPropertyDescriptor(prisma, '$transaction');

  Object.defineProperty(prisma, '$transaction', {
    configurable: true,
    writable: true,
    value: <U>(callback: (tx: DbClient) => Promise<U>): Promise<U> => callback({} as DbClient)
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

function request(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers
    }
  });
}

async function errorCode(response: Response): Promise<string | undefined> {
  const body = (await response.json()) as ApiErrorBody;
  return body.error.code;
}

async function login(email: string): Promise<string> {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'correct-password' })
  });
  assert.equal(response.status, 200, email);
  return ((await response.json()) as LoginResponse).token;
}

before(async () => {
  userRepository.findByEmail = async (email) => usersByEmail.get(email.toLowerCase()) ?? null;
  userRepository.findById = async (id) => usersById.get(id) ?? null;

  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  [tokenA, tokenB] = await Promise.all([login(staffA.email), login(staffB.email)]);
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  userRepository.findByEmail = originalFindByEmail;
  userRepository.findById = originalFindById;
});

test('staff menu and inventory reads use the authenticated outlet', async () => {
  let menuOutlet: string | undefined;
  let inventoryOutlet: string | undefined;
  let onlyAvailable: boolean | undefined;

  const restores = [
    stub(outletMenuItemRepository, 'findManyByOutletId', async (outletId, _skip, _take, available) => {
      menuOutlet = outletId;
      onlyAvailable = available;
      return [];
    }),
    stub(outletMenuItemRepository, 'countByOutletId', async () => 0),
    stub(outletInventoryRepository, 'findManyByOutletId', async (outletId) => {
      inventoryOutlet = outletId;
      return [];
    }),
    stub(outletInventoryRepository, 'countByOutletId', async () => 0)
  ];

  try {
    for (const { token, outletId } of [
      { token: tokenA, outletId: outletA },
      { token: tokenB, outletId: outletB }
    ]) {
      menuOutlet = undefined;
      inventoryOutlet = undefined;

      const menu = await request('/api/outlet/menu-items', token);
      const inventory = await request('/api/outlet/inventory', token);
      assert.equal(menu.status, 200);
      assert.equal(inventory.status, 200);
      assert.equal(menuOutlet, outletId);
      assert.equal(inventoryOutlet, outletId);
      assert.equal(onlyAvailable, true);
    }

    const forged = await request(`/api/outlet/menu-items?outletId=${outletB}`, tokenA);
    assert.equal(forged.status, 400);
    assert.equal(await errorCode(forged), 'VALIDATION_ERROR');
  } finally {
    restores.forEach((restore) => restore());
  }
});

test('staff cannot update inventory belonging to another outlet', async () => {
  let captured: { outletId: string; outletMenuItemId: string } | undefined;

  const restores = [
    stub(outletInventoryRepository, 'updateStock', async (outletId, outletMenuItemId) => {
      captured = { outletId, outletMenuItemId };
      return outletMenuItemId === itemA && outletId === outletA ? inventoryRecord : null;
    })
  ];

  try {
    const crossOutlet = await request(`/api/outlet/inventory/${itemB}`, tokenA, {
      method: 'PATCH',
      body: JSON.stringify({ quantity: 5 })
    });
    assert.equal(crossOutlet.status, 404);
    assert.equal(await errorCode(crossOutlet), 'NOT_FOUND');
    assert.deepEqual(captured, { outletId: outletA, outletMenuItemId: itemB });

    const ownOutlet = await request(`/api/outlet/inventory/${itemA}`, tokenA, {
      method: 'PATCH',
      body: JSON.stringify({ quantity: 5 })
    });
    assert.equal(ownOutlet.status, 200);
    assert.deepEqual(captured, { outletId: outletA, outletMenuItemId: itemA });
    const body = (await ownOutlet.json()) as OutletInventoryDto;
    assert.equal(body.outletMenuItemId, itemA);
  } finally {
    restores.forEach((restore) => restore());
  }
});

test('staff cannot add stock to inventory belonging to another outlet', async () => {
  let captured: Parameters<typeof outletInventoryRepository.addStock> | undefined;

  const restores = [
    stub(outletInventoryRepository, 'addStock', async (...args) => {
      captured = args;
      return args[0] === outletA && args[1] === itemA
        ? { ...inventoryRecord, quantity: 14 }
        : null;
    })
  ];

  try {
    const crossOutlet = await request(`/api/outlet/inventory/${itemB}/stock`, tokenA, {
      method: 'POST',
      body: JSON.stringify({ quantity: 5, note: 'Delivery' })
    });
    assert.equal(crossOutlet.status, 404);
    assert.equal(await errorCode(crossOutlet), 'NOT_FOUND');
    assert.deepEqual(captured, [outletA, itemB, 5, staffA.id, 'Delivery']);

    const ownOutlet = await request(`/api/outlet/inventory/${itemA}/stock`, tokenA, {
      method: 'POST',
      body: JSON.stringify({ quantity: 5, note: 'Delivery' })
    });
    assert.equal(ownOutlet.status, 200);
    assert.deepEqual(captured, [outletA, itemA, 5, staffA.id, 'Delivery']);
    const body = (await ownOutlet.json()) as OutletInventoryDto;
    assert.equal(body.outletMenuItemId, itemA);
    assert.equal(body.quantity, 14);
  } finally {
    restores.forEach((restore) => restore());
  }
});

test('stock movement reads scope filters to the authenticated outlet', async () => {
  const movementRecord: StockMovementRecord = {
    id: '00000000-0000-4000-8000-000000000051',
    outletId: outletA,
    outletMenuItemId: itemA,
    movementType: 'RESTOCK',
    quantityBefore: 4,
    quantityChange: 5,
    quantityAfter: 9,
    actorUserId: staffA.id,
    saleId: null,
    note: 'Delivery',
    createdAt: new Date(),
    outletMenuItem: inventoryRecord.outletMenuItem
  };

  let capturedFind: Parameters<typeof stockMovementRepository.findManyByOutletId> | undefined;
  let capturedCount: Parameters<typeof stockMovementRepository.countByOutletId> | undefined;

  const restores = [
    stub(stockMovementRepository, 'findManyByOutletId', async (...args) => {
      capturedFind = args;
      return args[0] === outletA ? [movementRecord] : [];
    }),
    stub(stockMovementRepository, 'countByOutletId', async (...args) => {
      capturedCount = args;
      return args[0] === outletA ? 1 : 0;
    })
  ];

  try {
    for (const { token, outletId } of [
      { token: tokenA, outletId: outletA },
      { token: tokenB, outletId: outletB }
    ]) {
      capturedFind = undefined;
      capturedCount = undefined;

      const response = await request(
        `/api/outlet/inventory/movements?outletMenuItemId=${itemB}`,
        token
      );
      assert.equal(response.status, 200);
      assert.equal(capturedFind?.[0], outletId);
      assert.equal(capturedFind?.[1], itemB);
      assert.deepEqual(capturedCount, [outletId, itemB]);

      const body = (await response.json()) as { items: StockMovementDto[] };
      assert.equal(body.items.length, outletId === outletA ? 1 : 0);
      if (outletId === outletA) {
        assert.equal(body.items[0]?.outletId, outletA);
      }
    }

    const forged = await request(`/api/outlet/inventory/movements?outletId=${outletB}`, tokenA);
    assert.equal(forged.status, 400);
  } finally {
    restores.forEach((restore) => restore());
  }
});

test('staff cannot create a sale from another outlet menu items', async () => {
  let checkedOutlet: string | undefined;
  let deducted = false;
  let created = false;

  const restores = [
    stub(outletMenuItemRepository, 'findAssignableByIds', async (_client, outletId, _ids) => {
      checkedOutlet = outletId;
      return [];
    }),
    stub(outletInventoryRepository, 'deductStock', async () => {
      deducted = true;
      return 10;
    }),
    stub(receiptCounterRepository, 'nextNumber', async () => 1),
    stub(saleRepository, 'create', async () => {
      created = true;
      return saleRecord;
    })
  ];

  try {
    await withTransactionMock(async () => {
      const response = await request('/api/outlet/sales', tokenA, {
        method: 'POST',
        body: JSON.stringify({ items: [{ outletMenuItemId: itemB, quantity: 1 }] })
      });
      assert.equal(response.status, 400);
      assert.equal(await errorCode(response), 'BAD_REQUEST');
    });

    assert.equal(checkedOutlet, outletA);
    assert.equal(deducted, false);
    assert.equal(created, false);
  } finally {
    restores.forEach((restore) => restore());
  }
});

test('sale creation forwards a valid idempotency key and rejects malformed keys', async () => {
  let captured: { outletId: string; cashierId: string; key?: string } | undefined;
  const restores = [
    stub(saleService, 'createSale', async (saleOutletId, cashierId, _items, key) => {
      captured = { outletId: saleOutletId, cashierId, key };
      return toSaleDto(saleRecord);
    })
  ];

  try {
    const valid = await request('/api/outlet/sales', tokenA, {
      method: 'POST',
      headers: { 'Idempotency-Key': 'checkout-1' },
      body: JSON.stringify({ items: [{ outletMenuItemId: itemA, quantity: 1 }] })
    });
    assert.equal(valid.status, 201);
    assert.deepEqual((await valid.json()) as SaleDto, toSaleDto(saleRecord));
    assert.deepEqual(captured, { outletId: outletA, cashierId: staffA.id, key: 'checkout-1' });

    const malformed = await request('/api/outlet/sales', tokenA, {
      method: 'POST',
      headers: { 'Idempotency-Key': 'bad key' },
      body: JSON.stringify({ items: [{ outletMenuItemId: itemA, quantity: 1 }] })
    });
    assert.equal(malformed.status, 400);
    assert.equal(await errorCode(malformed), 'VALIDATION_ERROR');
    assert.deepEqual(captured, { outletId: outletA, cashierId: staffA.id, key: 'checkout-1' });
  } finally {
    restores.forEach((restore) => restore());
  }
});

test('sales history, detail and receipts are scoped to the authenticated outlet', async () => {
  let listOutlet: string | undefined;
  let detailLookup: { saleId: string; outletId: string } | undefined;

  const restores = [
    stub(saleRepository, 'findManyByOutletId', async (_client, outletId) => {
      listOutlet = outletId;
      return [];
    }),
    stub(saleRepository, 'countByOutletId', async () => 0),
    stub(saleRepository, 'findByIdForOutlet', async (_client, saleId, outletId) => {
      detailLookup = { saleId, outletId };
      return saleId === saleA && outletId === outletA ? saleRecord : null;
    })
  ];

  try {
    const list = await request('/api/outlet/sales', tokenA);
    assert.equal(list.status, 200);
    assert.equal(listOutlet, outletA);

    for (const path of [`/api/outlet/sales/${saleB}`, `/api/outlet/sales/${saleB}/receipt`]) {
      const crossOutlet = await request(path, tokenA);
      assert.equal(crossOutlet.status, 404, path);
      assert.equal(await errorCode(crossOutlet), 'NOT_FOUND', path);
      assert.deepEqual(detailLookup, { saleId: saleB, outletId: outletA });
    }

    const ownOutlet = await request(`/api/outlet/sales/${saleA}`, tokenA);
    assert.equal(ownOutlet.status, 200);
    assert.deepEqual(detailLookup, { saleId: saleA, outletId: outletA });
  } finally {
    restores.forEach((restore) => restore());
  }
});

test('outlet dashboard metrics use the authenticated outlet', async () => {
  const scopedOutlets: Array<string | null> = [];

  const restores = [
    stub(outletRepository, 'findById', async (id) => (id === outletA ? outletRecord : null)),
    stub(reportingRepository, 'countLowStockItems', async (_client, outletId) => {
      scopedOutlets.push(outletId);
      return 0;
    }),
    stub(reportingRepository, 'salesSummary', async (_client, outletId) => {
      scopedOutlets.push(outletId);
      return { salesCount: 0, revenueCents: 0 };
    }),
    stub(saleRepository, 'findManyForRange', async (_client, outletId) => {
      scopedOutlets.push(outletId);
      return [];
    })
  ];

  try {
    const response = await request('/api/dashboard/outlet', tokenA);
    assert.equal(response.status, 200);
    assert.deepEqual(scopedOutlets, [outletA, outletA, outletA]);
    const body = (await response.json()) as { outletId: string };
    assert.equal(body.outletId, outletA);
  } finally {
    restores.forEach((restore) => restore());
  }
});
