import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NotFoundError } from '../src/errors/AppError';
import {
  outletRepository,
  type CreateOutletRecord
} from '../src/repositories/outlet.repository';
import { outletService } from '../src/services/outlet.service';

const outletRecord = {
  id: '00000000-0000-4000-8000-000000000002',
  code: 'MAIN',
  name: 'Main Outlet',
  address: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date()
};

test('outlet service normalizes code and empty address on create', async () => {
  const original = outletRepository.create;
  let captured: CreateOutletRecord | undefined;

  outletRepository.create = async (data: CreateOutletRecord) => {
    captured = data;
    return outletRecord;
  };

  try {
    const result = await outletService.create({ code: ' main ', name: ' Main Outlet ', address: '   ' });

    assert.equal(captured?.code, 'MAIN');
    assert.equal(captured?.address, null);
    assert.equal(result.code, 'MAIN');
  } finally {
    outletRepository.create = original;
  }
});

test('outlet service rejects deactivation of a missing outlet', async () => {
  const originalFind = outletRepository.findById;
  outletRepository.findById = async () => null;

  try {
    await assert.rejects(() => outletService.deactivate(outletRecord.id), NotFoundError);
  } finally {
    outletRepository.findById = originalFind;
  }
});
