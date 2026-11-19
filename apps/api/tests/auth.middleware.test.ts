import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import type { ApiErrorBody, LoginResponse } from '@pos/shared';
import jwt, { type SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app';
import { env } from '../src/config/env';
import { userRepository } from '../src/repositories/user.repository';

const passwordHash = bcrypt.hashSync('correct-password', 10);

const admin = {
  id: '00000000-0000-4000-8000-000000000030',
  email: 'admin@example.com',
  passwordHash,
  fullName: 'HQ Admin',
  role: 'HQ_ADMIN' as const,
  outletId: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date()
};

const staff = {
  id: '00000000-0000-4000-8000-000000000031',
  email: 'staff@example.com',
  passwordHash,
  fullName: 'Outlet Staff',
  role: 'OUTLET_STAFF' as const,
  outletId: '00000000-0000-4000-8000-000000000032',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date()
};

const staffWithoutOutlet = {
  ...staff,
  id: '00000000-0000-4000-8000-000000000033',
  email: 'nooutlet@example.com',
  fullName: 'Staff Without Outlet',
  outletId: null
};

const inactiveStaff = {
  ...staff,
  id: '00000000-0000-4000-8000-000000000034',
  email: 'inactive@example.com',
  isActive: false
};

const users = [admin, staff, staffWithoutOutlet, inactiveStaff];
const usersByEmail = new Map(users.map((user) => [user.email, user]));
const usersById = new Map(users.map((user) => [user.id, user]));

const hqPaths = [
  '/api/outlets',
  '/api/menu-items',
  '/api/users/staff',
  '/api/dashboard/hq',
  '/api/reports/sales/summary',
  '/api/reports/revenue/by-outlet',
  '/api/reports/transactions/by-outlet',
  '/api/reports/top-items'
];

const staffPaths = [
  '/api/outlet/menu-items',
  '/api/outlet/inventory',
  '/api/outlet/sales',
  '/api/dashboard/outlet'
];

const originalFindByEmail = userRepository.findByEmail;
const originalFindById = userRepository.findById;

let server: Server;
let baseUrl: string;

function tokenFor(userId: string, options?: SignOptions): string {
  return jwt.sign({ sub: userId }, env.JWT_SECRET, { expiresIn: '1h', ...options });
}

function get(path: string, token?: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined
  });
}

async function errorCode(response: Response): Promise<string | undefined> {
  const body = (await response.json()) as ApiErrorBody;
  return body.error.code;
}

before(async () => {
  userRepository.findByEmail = async (email) => usersByEmail.get(email.toLowerCase()) ?? null;
  userRepository.findById = async (id) => usersById.get(id) ?? null;

  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  userRepository.findByEmail = originalFindByEmail;
  userRepository.findById = originalFindById;
});

test('login verifies bcrypt hashes and issues a token carrying only the user id', async () => {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: staff.email, password: 'correct-password' })
  });
  assert.equal(response.status, 200);

  const body = (await response.json()) as LoginResponse;
  const payload = jwt.verify(body.token, env.JWT_SECRET) as Record<string, unknown>;
  assert.equal(payload.sub, staff.id);
  assert.equal(payload.role, undefined);
  assert.equal(payload.outletId, undefined);
  assert.equal(body.user.outletId, staff.outletId);
  assert.equal(body.user.role, 'OUTLET_STAFF');
});

test('login rejects invalid credentials and inactive accounts', async () => {
  const attempts = [
    { email: staff.email, password: 'wrong-password', status: 401 },
    { email: 'missing@example.com', password: 'correct-password', status: 401 },
    { email: inactiveStaff.email, password: 'correct-password', status: 401 },
    { email: 'not-an-email', password: 'correct-password', status: 400 }
  ];

  for (const attempt of attempts) {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: attempt.email, password: attempt.password })
    });
    assert.equal(response.status, attempt.status, attempt.email);
  }
});

test('authenticate rejects missing, malformed, tampered, expired and payload-less tokens', async () => {
  const validToken = tokenFor(admin.id);
  const tamperedToken = `${validToken.slice(0, -1)}${validToken.endsWith('A') ? 'B' : 'A'}`;
  const cases: Array<{ name: string; authorization?: string }> = [
    { name: 'missing header' },
    { name: 'missing scheme', authorization: validToken },
    { name: 'empty token', authorization: 'Bearer ' },
    { name: 'tampered signature', authorization: `Bearer ${tamperedToken}` },
    { name: 'random token', authorization: 'Bearer not-a-jwt' },
    {
      name: 'expired token',
      authorization: `Bearer ${jwt.sign({ sub: admin.id }, env.JWT_SECRET, { expiresIn: -1 })}`
    },
    {
      name: 'token without subject',
      authorization: `Bearer ${jwt.sign({ role: 'HQ_ADMIN' }, env.JWT_SECRET)}`
    }
  ];

  for (const entry of cases) {
    const response = await fetch(`${baseUrl}/api/auth/me`, {
      headers: entry.authorization ? { Authorization: entry.authorization } : undefined
    });
    assert.equal(response.status, 401, entry.name);
    assert.equal(await errorCode(response), 'UNAUTHORIZED', entry.name);
  }

  const authenticated = await get('/api/auth/me', validToken);
  assert.equal(authenticated.status, 200);
});

test('authenticate reloads the user and rejects tokens for deactivated accounts', async () => {
  const response = await get('/api/auth/me', tokenFor(inactiveStaff.id));
  assert.equal(response.status, 401);
  assert.equal(await errorCode(response), 'UNAUTHORIZED');
});

test('HQ-only routes reject anonymous and outlet staff callers', async () => {
  for (const path of hqPaths) {
    const anonymous = await get(path);
    assert.equal(anonymous.status, 401, path);
    assert.equal(await errorCode(anonymous), 'UNAUTHORIZED', path);

    const forbidden = await get(path, tokenFor(staff.id));
    assert.equal(forbidden.status, 403, path);
    assert.equal(await errorCode(forbidden), 'FORBIDDEN', path);
  }
});

test('staff-only routes reject anonymous and HQ admin callers', async () => {
  for (const path of staffPaths) {
    const anonymous = await get(path);
    assert.equal(anonymous.status, 401, path);
    assert.equal(await errorCode(anonymous), 'UNAUTHORIZED', path);

    const forbidden = await get(path, tokenFor(admin.id));
    assert.equal(forbidden.status, 403, path);
    assert.equal(await errorCode(forbidden), 'FORBIDDEN', path);
  }
});

test('staff without an outlet association cannot use outlet-scoped routes', async () => {
  for (const path of staffPaths) {
    const response = await get(path, tokenFor(staffWithoutOutlet.id));
    assert.equal(response.status, 403, path);
    assert.equal(await errorCode(response), 'FORBIDDEN', path);
  }
});
