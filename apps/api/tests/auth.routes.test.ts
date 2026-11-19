import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app';
import { userRepository } from '../src/repositories/user.repository';

const passwordHash = bcrypt.hashSync('correct-password', 10);

const validUser = {
  id: '00000000-0000-4000-8000-000000000004',
  email: 'admin@example.com',
  passwordHash,
  fullName: 'HQ Admin',
  role: 'HQ_ADMIN' as const,
  outletId: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date()
};

const staffUser = {
  id: '00000000-0000-4000-8000-000000000005',
  email: 'staff@example.com',
  passwordHash,
  fullName: 'Outlet Staff',
  role: 'OUTLET_STAFF' as const,
  outletId: '00000000-0000-4000-8000-000000000006',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date()
};

test('auth HTTP routes validate input, issue tokens and protect /me', async () => {
  const originalByEmail = userRepository.findByEmail;
  const originalById = userRepository.findById;
  userRepository.findByEmail = async (email) => (email === staffUser.email ? staffUser : validUser);
  userRepository.findById = async (id) => (id === staffUser.id ? staffUser : validUser);

  const server = createApp().listen(0);

  try {
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    const { port } = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${port}`;

    const invalidResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email' })
    });
    assert.equal(invalidResponse.status, 400);
    const invalidBody = (await invalidResponse.json()) as { error: { code: string } };
    assert.equal(invalidBody.error.code, 'VALIDATION_ERROR');

    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: validUser.email, password: 'correct-password' })
    });
    assert.equal(loginResponse.status, 200);
    const loginBody = (await loginResponse.json()) as { token: string; user: { role: string } };
    assert.ok(loginBody.token.length > 0);
    assert.equal(loginBody.user.role, 'HQ_ADMIN');

    const unauthorizedResponse = await fetch(`${baseUrl}/api/auth/me`);
    assert.equal(unauthorizedResponse.status, 401);

    const meResponse = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${loginBody.token}` }
    });
    assert.equal(meResponse.status, 200);
    const meBody = (await meResponse.json()) as { id: string };
    assert.equal(meBody.id, validUser.id);

    const staffLoginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: staffUser.email, password: 'correct-password' })
    });
    assert.equal(staffLoginResponse.status, 200);
    const staffLoginBody = (await staffLoginResponse.json()) as { token: string };

    const forbiddenResponse = await fetch(`${baseUrl}/api/outlets`, {
      headers: { Authorization: `Bearer ${staffLoginBody.token}` }
    });
    assert.equal(forbiddenResponse.status, 403);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    userRepository.findByEmail = originalByEmail;
    userRepository.findById = originalById;
  }
});
