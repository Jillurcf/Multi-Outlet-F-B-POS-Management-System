import assert from 'node:assert/strict';
import { test } from 'node:test';
import bcrypt from 'bcryptjs';
import { NotFoundError } from '../src/errors/AppError';
import { outletRepository } from '../src/repositories/outlet.repository';
import { userRepository, type CreateUserRecord } from '../src/repositories/user.repository';
import { userService } from '../src/services/user.service';

const outletRecord = {
  id: '00000000-0000-4000-8000-000000000007',
  code: 'MAIN',
  name: 'Main Outlet',
  address: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date()
};

test('staff creation hashes the password and binds the staff user to the outlet', async () => {
  const originalFindOutlet = outletRepository.findById;
  const originalCreateUser = userRepository.create;
  let captured: CreateUserRecord | undefined;

  outletRepository.findById = async () => outletRecord;
  userRepository.create = async (data: CreateUserRecord) => {
    captured = data;
    return {
      id: '00000000-0000-4000-8000-000000000008',
      ...data,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  };

  try {
    const result = await userService.createStaff({
      email: ' STAFF@EXAMPLE.COM ',
      password: 'a-strong-password',
      fullName: ' Outlet Staff ',
      outletId: outletRecord.id
    });

    assert.equal(result.role, 'OUTLET_STAFF');
    assert.equal(result.outletId, outletRecord.id);
    assert.equal(captured?.email, 'staff@example.com');
    assert.notEqual(captured?.passwordHash, 'a-strong-password');
    assert.ok(await bcrypt.compare('a-strong-password', captured?.passwordHash ?? ''));
  } finally {
    outletRepository.findById = originalFindOutlet;
    userRepository.create = originalCreateUser;
  }
});

test('staff creation rejects an inactive outlet', async () => {
  const originalFindOutlet = outletRepository.findById;
  outletRepository.findById = async () => ({ ...outletRecord, isActive: false });

  try {
    await assert.rejects(
      () =>
        userService.createStaff({
          email: 'staff@example.com',
          password: 'a-strong-password',
          fullName: 'Outlet Staff',
          outletId: outletRecord.id
        }),
      NotFoundError
    );
  } finally {
    outletRepository.findById = originalFindOutlet;
  }
});
