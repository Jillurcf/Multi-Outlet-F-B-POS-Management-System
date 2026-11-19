import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DbClient } from '../src/repositories/types';
import { reportingRepository } from '../src/repositories/reporting.repository';

interface CapturedSql {
  strings: readonly string[];
  values: readonly unknown[];
}

function fakeClient(rows: unknown[] = []) {
  let captured: CapturedSql | undefined;
  const client = {
    $queryRaw: async (query: unknown) => {
      captured = query as CapturedSql;
      return rows;
    }
  } as unknown as DbClient;

  return { client, get captured(): CapturedSql | undefined {
    return captured;
  } };
}

const from = new Date('2026-01-05T00:00:00.000Z');
const to = new Date('2026-01-06T23:59:59.999Z');

test('outlet revenue aggregates completed sales snapshots within the date range', async () => {
  const fake = fakeClient();

  const rows = await reportingRepository.outletRevenue(fake.client, from, to);

  assert.deepEqual(rows, []);
  const sql = fake.captured?.strings.join('') ?? '';
  assert.match(sql, /COALESCE\(SUM\(s\."total_cents"\), 0\)::int AS "revenueCents"/);
  assert.match(sql, /COUNT\(s\."id"\)::int AS "transactionCount"/);
  assert.match(sql, /GROUP BY o\."id", o\."name"/);
  assert.match(sql, /s\."created_at" >= /);
  assert.match(sql, /AND s\."created_at" <= /);
  assert.doesNotMatch(sql, /price_cents/);
  assert.deepEqual(fake.captured?.values, [from, to]);
});

test('top selling items rank sale item snapshots per outlet and cap results at five', async () => {
  const fake = fakeClient();

  const rows = await reportingRepository.topSellingItems(fake.client, from, to);

  assert.deepEqual(rows, []);
  const sql = fake.captured?.strings.join('') ?? '';
  assert.match(sql, /SUM\(si\."quantity"\)::int AS "quantitySold"/);
  assert.match(sql, /SUM\(si\."line_total_cents"\)::int AS "revenueCents"/);
  assert.match(sql, /PARTITION BY "outletId"/);
  assert.match(sql, /"rank" <= /);
  assert.match(sql, /s\."created_at" >= .* AND s\."created_at" <= /);
  assert.doesNotMatch(sql, /price_cents/);
  assert.doesNotMatch(sql, /"menu_items"/);
  assert.deepEqual(fake.captured?.values, [from, to, 5]);
});
