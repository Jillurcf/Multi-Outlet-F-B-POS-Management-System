import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ServiceUnavailableError } from '../src/errors/AppError';
import { healthRepository } from '../src/repositories/health.repository';
import { healthService } from '../src/services/health.service';

test('health service returns ok when the database is reachable', async () => {
  const original = healthRepository.checkDatabase;
  healthRepository.checkDatabase = async () => true;

  try {
    const status = await healthService.getStatus();

    assert.equal(status.status, 'ok');
    assert.equal(status.service, 'pos-api');
    assert.equal(status.database, 'up');
  } finally {
    healthRepository.checkDatabase = original;
  }
});

test('health service throws 503 when the database is unreachable', async () => {
  const original = healthRepository.checkDatabase;
  healthRepository.checkDatabase = async () => false;

  try {
    await assert.rejects(() => healthService.getStatus(), (error: unknown) => {
      assert.ok(error instanceof ServiceUnavailableError);
      assert.equal(error.statusCode, 503);
      return true;
    });
  } finally {
    healthRepository.checkDatabase = original;
  }
});
