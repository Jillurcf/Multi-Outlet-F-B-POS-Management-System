import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { createApp } from '../src/app';

test('API responses include hardening headers and normalize malformed JSON', async () => {
  const server = createApp().listen(0);

  try {
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    const { port } = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${port}`;

    const rootResponse = await fetch(`${baseUrl}/`);
    assert.equal(rootResponse.status, 200);
    assert.equal(rootResponse.headers.get('cache-control'), 'no-store');
    assert.equal(rootResponse.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(rootResponse.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(rootResponse.headers.get('x-frame-options'), 'DENY');

    const notFoundResponse = await fetch(`${baseUrl}/api/missing`);
    assert.equal(notFoundResponse.status, 404);
    const notFoundBody = (await notFoundResponse.json()) as { error: { code: string } };
    assert.equal(notFoundBody.error.code, 'NOT_FOUND');

    const malformedResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{'
    });
    assert.equal(malformedResponse.status, 400);
    const malformedBody = (await malformedResponse.json()) as { error: { code: string } };
    assert.equal(malformedBody.error.code, 'BAD_REQUEST');
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
