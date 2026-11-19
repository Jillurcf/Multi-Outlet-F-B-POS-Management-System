import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import type { ApiErrorBody, LoginResponse, MenuItemDto, OutletMenuItemDto, Paginated } from '@pos/shared';
import type { MenuItem, Outlet } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app';
import { prisma } from '../src/config/prisma';
import {
  menuItemRepository,
  type CreateMenuItemRecord
} from '../src/repositories/menuItem.repository';
import { outletInventoryRepository } from '../src/repositories/outletInventory.repository';
import {
  outletMenuItemRepository,
  type CreateOutletMenuItemRecord,
  type OutletMenuItemRecord
} from '../src/repositories/outletMenuItem.repository';
import { outletRepository } from '../src/repositories/outlet.repository';
import { receiptCounterRepository } from '../src/repositories/receiptCounter.repository';
import { saleRepository } from '../src/repositories/sale.repository';
import type { DbClient } from '../src/repositories/types';
import { userRepository } from '../src/repositories/user.repository';

const outletAId = '00000000-0000-4000-8000-000000000070';
const outletBId = '00000000-0000-4000-8000-000000000071';
const inactiveOutletId = '00000000-0000-4000-8000-000000000072';
const menuAId = '00000000-0000-4000-8000-000000000073';
const menuBId = '00000000-0000-4000-8000-000000000074';
const inactiveMenuId = '00000000-0000-4000-8000-000000000075';
const assignA1Id = '00000000-0000-4000-8000-000000000076';
const assignA2Id = '00000000-0000-4000-8000-000000000077';
const assignB1Id = '00000000-0000-4000-8000-000000000078';

const passwordHash = bcrypt.hashSync('correct-password', 10);

const admin = {
  id: '00000000-0000-4000-8000-000000000079',
  email: 'admin@example.com',
  passwordHash,
  fullName: 'HQ Admin',
  role: 'HQ_ADMIN' as const,
  outletId: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date()
};

const staffA = {
  id: '00000000-0000-4000-8000-000000000080',
  email: 'staff-a@example.com',
  passwordHash,
  fullName: 'Staff A',
  role: 'OUTLET_STAFF' as const,
  outletId: outletAId,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date()
};

const staffB = {
  ...staffA,
  id: '00000000-0000-4000-8000-000000000081',
  email: 'staff-b@example.com',
  fullName: 'Staff B',
  outletId: outletBId
};

type TestUser = typeof admin | typeof staffA;

const usersByEmail = new Map<string, TestUser>([
  [admin.email, admin],
  [staffA.email, staffA],
  [staffB.email, staffB]
]);
const usersById = new Map<string, TestUser>([
  [admin.id, admin],
  [staffA.id, staffA],
  [staffB.id, staffB]
]);

function menuItem(id: string, sku: string, name: string, isActive = true): MenuItem {
  return {
    id,
    sku,
    name,
    category: 'Beverages',
    description: null,
    isActive,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

const menuA = menuItem(menuAId, 'COFFEE-01', 'Coffee');
const menuB = menuItem(menuBId, 'TEA-01', 'Tea');
const inactiveMenu = menuItem(inactiveMenuId, 'OLD-01', 'Old Drink', false);

function outlet(id: string, code: string, isActive = true): Outlet {
  return {
    id,
    code,
    name: code,
    address: null,
    isActive,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

const outletA = outlet(outletAId, 'MAIN');
const outletB = outlet(outletBId, 'NORTH');
const inactiveOutlet = outlet(inactiveOutletId, 'CLOSED', false);

function assignment(
  id: string,
  outletId: string,
  item: MenuItem,
  priceCents: number,
  quantity = 10
): OutletMenuItemRecord {
  const inventory = {
    id: `${id.slice(0, -1)}9`,
    outletMenuItemId: id,
    quantity,
    lowStockThreshold: 2,
    updatedAt: new Date()
  };

  return {
    id,
    outletId,
    menuItemId: item.id,
    priceCents,
    isAvailable: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    menuItem: item,
    inventory
  };
}

const assignmentA1 = assignment(assignA1Id, outletAId, menuA, 550);
const assignmentA2 = assignment(assignA2Id, outletAId, menuB, 1250);
const assignmentB1 = assignment(assignB1Id, outletBId, menuA, 499);

const assignmentsByOutlet = new Map([
  [outletAId, [assignmentA1, assignmentA2]],
  [outletBId, [assignmentB1]]
]);

const originalFindByEmail = userRepository.findByEmail;
const originalFindById = userRepository.findById;

let server: Server;
let baseUrl: string;
let adminToken: string;
let staffAToken: string;
let staffBToken: string;

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
  [adminToken, staffAToken, staffBToken] = await Promise.all([
    login(admin.email),
    login(staffA.email),
    login(staffB.email)
  ]);
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  userRepository.findByEmail = originalFindByEmail;
  userRepository.findById = originalFindById;
});

test('HQ admin creates master menu items with normalized fields and strict validation', async () => {
  let captured: CreateMenuItemRecord | undefined;
  const restores = [
    stub(menuItemRepository, 'create', async (data) => {
      captured = data;
      return { ...menuA, ...data };
    })
  ];

  try {
    const created = await request('/api/menu-items', adminToken, {
      method: 'POST',
      body: JSON.stringify({
        sku: ' coffee-01 ',
        name: ' Coffee ',
        category: ' Beverages ',
        description: '  '
      })
    });
    assert.equal(created.status, 201);
    const body = (await created.json()) as MenuItemDto;
    assert.equal(body.sku, 'COFFEE-01');
    assert.equal(body.name, 'Coffee');
    assert.equal(body.description, null);
    assert.equal(captured?.sku, 'COFFEE-01');
    assert.equal(captured?.category, 'Beverages');

    const invalidBodies = [
      { sku: 'bad sku!', name: 'Coffee', category: 'Beverages' },
      { sku: 'COFFEE-01' },
      { sku: 'COFFEE-01', name: 'Coffee', category: 'Beverages', extra: true }
    ];

    for (const invalid of invalidBodies) {
      const response = await request('/api/menu-items', adminToken, {
        method: 'POST',
        body: JSON.stringify(invalid)
      });
      assert.equal(response.status, 400);
      assert.equal(await errorCode(response), 'VALIDATION_ERROR');
    }
  } finally {
    restores.forEach((restore) => restore());
  }
});

test('HQ admin lists, updates and deactivates master menu items', async () => {
  let deactivatedId: string | undefined;
  const restores = [
    stub(menuItemRepository, 'findMany', async () => [menuA, menuB]),
    stub(menuItemRepository, 'count', async () => 2),
    stub(menuItemRepository, 'findById', async (id) =>
      id === menuAId ? menuA : id === inactiveMenuId ? inactiveMenu : null
    ),
    stub(menuItemRepository, 'update', async (id, data) => ({ ...menuA, id, ...data })),
    stub(menuItemRepository, 'deactivate', async (id) => {
      deactivatedId = id;
      return { ...menuA, isActive: false };
    })
  ];

  try {
    const list = await request('/api/menu-items?page=1&limit=20', adminToken);
    assert.equal(list.status, 200);
    const listBody = (await list.json()) as Paginated<MenuItemDto>;
    assert.equal(listBody.total, 2);
    assert.equal(listBody.items[0]?.sku, 'COFFEE-01');

    const detail = await request(`/api/menu-items/${menuAId}`, adminToken);
    assert.equal(detail.status, 200);

    const missing = await request(`/api/menu-items/${inactiveMenuId}`, adminToken);
    assert.equal(missing.status, 200);
    assert.equal(((await missing.json()) as MenuItemDto).isActive, false);

    const updated = await request(`/api/menu-items/${menuAId}`, adminToken, {
      method: 'PATCH',
      body: JSON.stringify({ sku: ' coffee-02 ', name: 'Coffee Classic' })
    });
    assert.equal(updated.status, 200);
    const updatedBody = (await updated.json()) as MenuItemDto;
    assert.equal(updatedBody.sku, 'COFFEE-02');
    assert.equal(updatedBody.name, 'Coffee Classic');

    const emptyUpdate = await request(`/api/menu-items/${menuAId}`, adminToken, {
      method: 'PATCH',
      body: JSON.stringify({})
    });
    assert.equal(emptyUpdate.status, 400);

    const unknown = await request(`/api/menu-items/${assignA1Id}`, adminToken);
    assert.equal(unknown.status, 404);

    const deactivated = await request(`/api/menu-items/${menuAId}`, adminToken, { method: 'DELETE' });
    assert.equal(deactivated.status, 204);
    assert.equal(deactivatedId, menuAId);
  } finally {
    restores.forEach((restore) => restore());
  }
});

test('HQ admin assigns menu items with validated outlet-specific prices', async () => {
  let captured: CreateOutletMenuItemRecord | undefined;
  const restores = [
    stub(outletRepository, 'findById', async (id) =>
      id === outletAId ? outletA : id === outletBId ? outletB : id === inactiveOutletId ? inactiveOutlet : null
    ),
    stub(menuItemRepository, 'findById', async (id) =>
      id === menuAId ? menuA : id === menuBId ? menuB : id === inactiveMenuId ? inactiveMenu : null
    ),
    stub(outletMenuItemRepository, 'create', async (data) => {
      captured = data;
      return assignment(assignA1Id, data.outletId, menuA, data.priceCents, 0);
    })
  ];

  try {
    const assigned = await request(`/api/outlets/${outletAId}/menu-items`, adminToken, {
      method: 'POST',
      body: JSON.stringify({ menuItemId: menuAId, priceCents: 550, isAvailable: true })
    });
    assert.equal(assigned.status, 201);
    const body = (await assigned.json()) as OutletMenuItemDto;
    assert.equal(body.priceCents, 550);
    assert.equal(body.quantity, 0);
    assert.equal(captured?.outletId, outletAId);

    const invalidPrices = [0, -1, 12.5, 100_000_001];
    for (const priceCents of invalidPrices) {
      const response = await request(`/api/outlets/${outletAId}/menu-items`, adminToken, {
        method: 'POST',
        body: JSON.stringify({ menuItemId: menuAId, priceCents })
      });
      assert.equal(response.status, 400, String(priceCents));
    }

    const invalidBody = await request(`/api/outlets/${outletAId}/menu-items`, adminToken, {
      method: 'POST',
      body: JSON.stringify({ priceCents: 550 })
    });
    assert.equal(invalidBody.status, 400);

    const inactiveOutletResponse = await request(`/api/outlets/${inactiveOutletId}/menu-items`, adminToken, {
      method: 'POST',
      body: JSON.stringify({ menuItemId: menuAId, priceCents: 550 })
    });
    assert.equal(inactiveOutletResponse.status, 409);

    const inactiveItem = await request(`/api/outlets/${outletAId}/menu-items`, adminToken, {
      method: 'POST',
      body: JSON.stringify({ menuItemId: inactiveMenuId, priceCents: 550 })
    });
    assert.equal(inactiveItem.status, 409);

    const missingOutlet = await request(`/api/outlets/${menuBId}/menu-items`, adminToken, {
      method: 'POST',
      body: JSON.stringify({ menuItemId: menuAId, priceCents: 550 })
    });
    assert.equal(missingOutlet.status, 404);

    const missingItem = await request(`/api/outlets/${outletAId}/menu-items`, adminToken, {
      method: 'POST',
      body: JSON.stringify({ menuItemId: assignA1Id, priceCents: 550 })
    });
    assert.equal(missingItem.status, 404);
  } finally {
    restores.forEach((restore) => restore());
  }
});

test('HQ admin views assignments and updates or deactivates outlet prices', async () => {
  let deactivatedId: string | undefined;
  const restores = [
    stub(outletRepository, 'findById', async (id) =>
      id === outletAId ? outletA : id === outletBId ? outletB : null
    ),
    stub(outletMenuItemRepository, 'findManyByOutletId', async (outletId) =>
      assignmentsByOutlet.get(outletId) ?? []
    ),
    stub(outletMenuItemRepository, 'countByOutletId', async (outletId) =>
      assignmentsByOutlet.get(outletId)?.length ?? 0
    ),
    stub(outletMenuItemRepository, 'findByOutletAndMenuItem', async (outletId, menuItemId) =>
      (assignmentsByOutlet.get(outletId) ?? []).find((entry) => entry.menuItemId === menuItemId) ?? null
    ),
    stub(outletMenuItemRepository, 'update', async (id, data) => ({
      ...assignmentA1,
      id,
      ...data
    })),
    stub(outletMenuItemRepository, 'deactivate', async (id) => {
      deactivatedId = id;
      return assignmentA1;
    })
  ];

  try {
    const list = await request(`/api/outlets/${outletAId}/menu-items`, adminToken);
    assert.equal(list.status, 200);
    const listBody = (await list.json()) as Paginated<OutletMenuItemDto>;
    assert.equal(listBody.total, 2);
    assert.deepEqual(
      listBody.items.map((entry) => entry.priceCents),
      [550, 1250]
    );

    const invalidOutlet = await request('/api/outlets/not-a-uuid/menu-items', adminToken);
    assert.equal(invalidOutlet.status, 400);

    const updated = await request(`/api/outlets/${outletAId}/menu-items/${menuAId}`, adminToken, {
      method: 'PATCH',
      body: JSON.stringify({ priceCents: 650, isAvailable: false })
    });
    assert.equal(updated.status, 200);
    const updatedBody = (await updated.json()) as OutletMenuItemDto;
    assert.equal(updatedBody.priceCents, 650);
    assert.equal(updatedBody.isAvailable, false);

    const emptyUpdate = await request(`/api/outlets/${outletAId}/menu-items/${menuAId}`, adminToken, {
      method: 'PATCH',
      body: JSON.stringify({})
    });
    assert.equal(emptyUpdate.status, 400);

    const missingAssignment = await request(`/api/outlets/${outletBId}/menu-items/${menuBId}`, adminToken, {
      method: 'PATCH',
      body: JSON.stringify({ priceCents: 650 })
    });
    assert.equal(missingAssignment.status, 404);

    const missingDelete = await request(`/api/outlets/${outletBId}/menu-items/${menuBId}`, adminToken, {
      method: 'DELETE'
    });
    assert.equal(missingDelete.status, 404);

    const deactivated = await request(`/api/outlets/${outletAId}/menu-items/${menuAId}`, adminToken, {
      method: 'DELETE'
    });
    assert.equal(deactivated.status, 204);
    assert.equal(deactivatedId, assignA1Id);
  } finally {
    restores.forEach((restore) => restore());
  }
});

test('staff retrieves only assigned menu items at their own outlet with outlet prices', async () => {
  let onlyAvailable: boolean | undefined;
  const restores = [
    stub(outletMenuItemRepository, 'findManyByOutletId', async (outletId, _skip, _take, available) => {
      onlyAvailable = available;
      return assignmentsByOutlet.get(outletId) ?? [];
    }),
    stub(outletMenuItemRepository, 'countByOutletId', async (outletId) =>
      assignmentsByOutlet.get(outletId)?.length ?? 0
    )
  ];

  try {
    const forA = await request('/api/outlet/menu-items', staffAToken);
    assert.equal(forA.status, 200);
    const bodyA = (await forA.json()) as Paginated<OutletMenuItemDto>;
    assert.deepEqual(
      bodyA.items.map((entry) => entry.id),
      [assignA1Id, assignA2Id]
    );
    assert.deepEqual(
      bodyA.items.map((entry) => entry.priceCents),
      [550, 1250]
    );
    assert.equal(onlyAvailable, true);

    const forB = await request('/api/outlet/menu-items', staffBToken);
    assert.equal(forB.status, 200);
    const bodyB = (await forB.json()) as Paginated<OutletMenuItemDto>;
    assert.deepEqual(
      bodyB.items.map((entry) => entry.id),
      [assignB1Id]
    );
    assert.equal(bodyB.items[0]?.sku, 'COFFEE-01');
    assert.equal(bodyB.items[0]?.priceCents, 499);
    assert.equal(bodyB.items[0]?.outletId, outletBId);
  } finally {
    restores.forEach((restore) => restore());
  }
});

test('outlet cannot sell a menu item that is not assigned to it', async () => {
  let deducted = false;
  let created = false;
  const restores = [
    stub(outletMenuItemRepository, 'findAssignableByIds', async () => []),
    stub(outletInventoryRepository, 'deductStock', async () => {
      deducted = true;
      return 5;
    }),
    stub(receiptCounterRepository, 'nextNumber', async () => 1),
    stub(saleRepository, 'create', async () => {
      created = true;
      throw new Error('sale should not be created');
    })
  ];

  try {
    await withTransactionMock(async () => {
      const response = await request('/api/outlet/sales', staffAToken, {
        method: 'POST',
        body: JSON.stringify({
          items: [{ outletMenuItemId: assignB1Id, quantity: 1 }]
        })
      });
      assert.equal(response.status, 400);
      assert.equal(await errorCode(response), 'BAD_REQUEST');
    });

    assert.equal(deducted, false);
    assert.equal(created, false);
  } finally {
    restores.forEach((restore) => restore());
  }
});
