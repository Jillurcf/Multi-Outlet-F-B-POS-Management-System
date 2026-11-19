import assert from 'node:assert/strict';
import { test } from 'node:test';
import bcrypt from 'bcryptjs';
import { UnauthorizedError } from '../src/errors/AppError';
import { userRepository } from '../src/repositories/user.repository';
import { authService } from '../src/services/auth.service';

const validUser = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'admin@example.com',
  passwordHash: bcrypt.hashSync('correct-password', 10),
  fullName: 'HQ Admin',
  role: 'HQ_ADMIN' as const,
  outletId: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date()
};

test('login issues a token for valid credentials', async () => {
  const original = userRepository.findByEmail;
  userRepository.findByEmail = async () => validUser;

  try {
    const result = await authService.login('ADMIN@EXAMPLE.COM', 'correct-password');

    assert.ok(result.token.length > 0);
    assert.equal(result.user.id, validUser.id);
    assert.equal(result.user.role, 'HQ_ADMIN');
    assert.equal(result.user.outletId, null);
  } finally {
    userRepository.findByEmail = original;
  }
});

test('login rejects an invalid password', async () => {
  const original = userRepository.findByEmail;
  userRepository.findByEmail = async () => validUser;

  try {
    await assert.rejects(() => authService.login(validUser.email, 'wrong-password'), UnauthorizedError);
  } finally {
    userRepository.findByEmail = original;
  }
});

test('login rejects an inactive user', async () => {
  const original = userRepository.findByEmail;
  userRepository.findByEmail = async () => ({ ...validUser, isActive: false });

  try {
    await assert.rejects(() => authService.login(validUser.email, 'correct-password'), UnauthorizedError);
  } finally {
    userRepository.findByEmail = original;
  }
});
