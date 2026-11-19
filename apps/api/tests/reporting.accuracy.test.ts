import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  seedLineTotalCents,
  seedMenuItems,
  seedReportRange,
  seedSales,
  type SeedOutletCode
} from '../prisma/seedTransactions';
import {
  reportingRepository,
  type OutletRevenueRow,
  type TopSellingItemRow
} from '../src/repositories/reporting.repository';
import { reportingService, type DateRange } from '../src/services/reporting.service';

const outletIds: Record<SeedOutletCode, string> = {
  MAIN: '00000000-0000-4000-8000-000000000010',
  NORTH: '00000000-0000-4000-8000-000000000011'
};

const outletNames: Record<SeedOutletCode, string> = {
  MAIN: 'Main Outlet',
  NORTH: 'North Outlet'
};

const reportRange: DateRange = {
  from: new Date(seedReportRange.from),
  to: new Date(seedReportRange.to)
};

function inRange(createdAt: string, from: Date, to: Date): boolean {
  const value = new Date(createdAt);
  return value >= from && value <= to;
}

function aggregateOutletRevenue(from: Date, to: Date): OutletRevenueRow[] {
  return (['MAIN', 'NORTH'] as const)
    .map((code) => {
      const sales = seedSales.filter(
        (sale) => sale.outletCode === code && inRange(sale.createdAt, from, to)
      );

      return {
        outletId: outletIds[code],
        outletName: outletNames[code],
        revenueCents: sales.reduce((sum, sale) => sum + sale.totalCents, 0),
        transactionCount: sales.length
      };
    })
    .sort((a, b) => b.revenueCents - a.revenueCents || a.outletName.localeCompare(b.outletName));
}

function aggregateTopItems(from: Date, to: Date, limit: number): TopSellingItemRow[] {
  const rows: TopSellingItemRow[] = [];

  for (const code of ['MAIN', 'NORTH'] as const) {
    const totals = new Map<string, { quantitySold: number; revenueCents: number; name: string }>();

    for (const sale of seedSales) {
      if (sale.outletCode !== code || !inRange(sale.createdAt, from, to)) {
        continue;
      }

      for (const item of sale.items) {
        const total = totals.get(item.sku) ?? { quantitySold: 0, revenueCents: 0, name: item.name };
        total.quantitySold += item.quantity;
        total.revenueCents += seedLineTotalCents(item);
        totals.set(item.sku, total);
      }
    }

    [...totals.entries()]
      .map(([sku, total]) => ({
        sku,
        name: total.name,
        quantitySold: total.quantitySold,
        revenueCents: total.revenueCents
      }))
      .sort(
        (a, b) =>
          b.quantitySold - a.quantitySold ||
          b.revenueCents - a.revenueCents ||
          a.sku.localeCompare(b.sku)
      )
      .slice(0, limit)
      .forEach((item, index) => {
        rows.push({
          outletId: outletIds[code],
          outletName: outletNames[code],
          rank: index + 1,
          menuItemSku: item.sku,
          menuItemName: item.name,
          quantitySold: item.quantitySold,
          revenueCents: item.revenueCents
        });
      });
  }

  return rows.sort(
    (a, b) => a.outletName.localeCompare(b.outletName) || a.rank - b.rank
  );
}

test('seed transactions use sale-time prices that differ from current menu prices', () => {
  const coffee = seedMenuItems.find((item) => item.sku === 'COFFEE');
  const coffeeSales = seedSales
    .filter((sale) => sale.outletCode === 'MAIN' && inRange(sale.createdAt, reportRange.from, reportRange.to))
    .flatMap((sale) => sale.items)
    .filter((item) => item.sku === 'COFFEE');

  const historicalRevenue = coffeeSales.reduce(
    (sum, item) => sum + seedLineTotalCents(item),
    0
  );
  const currentPriceRevenue = coffeeSales.reduce(
    (sum, item) => sum + item.quantity * (coffee?.currentPriceCents ?? 0),
    0
  );

  assert.equal(historicalRevenue, 2_250);
  assert.equal(currentPriceRevenue, 3_000);
  assert.notEqual(historicalRevenue, currentPriceRevenue);

  for (const sale of seedSales) {
    const lineTotal = sale.items.reduce((sum, item) => sum + seedLineTotalCents(item), 0);
    assert.equal(lineTotal, sale.totalCents, `sale ${sale.id} line totals must equal its total`);
  }
});

test('revenue and transaction reports match the seeded transactions for the date range', async () => {
  const originalRevenue = reportingRepository.outletRevenue;
  const originalTopItems = reportingRepository.topSellingItems;
  let capturedLimit: number | undefined;

  try {
    reportingRepository.outletRevenue = async (_client, from, to) =>
      aggregateOutletRevenue(from, to);
    reportingRepository.topSellingItems = async (_client, from, to, limit) => {
      capturedLimit = limit;
      return aggregateTopItems(from, to, limit ?? 5);
    };

    const revenue = await reportingService.getRevenueByOutlet(reportRange);
    const transactions = await reportingService.getTransactionCountByOutlet(reportRange);
    const topItems = await reportingService.getTopSellingItems(reportRange);

    assert.deepEqual(revenue, [
      { outletId: outletIds.MAIN, outletName: 'Main Outlet', revenueCents: 5_800, transactionCount: 4 },
      { outletId: outletIds.NORTH, outletName: 'North Outlet', revenueCents: 5_700, transactionCount: 3 }
    ]);
    assert.deepEqual(transactions, [
      { outletId: outletIds.MAIN, outletName: 'Main Outlet', transactionCount: 4 },
      { outletId: outletIds.NORTH, outletName: 'North Outlet', transactionCount: 3 }
    ]);
    assert.equal(capturedLimit, 5);
    assert.deepEqual(topItems, [
      { outletId: outletIds.MAIN, outletName: 'Main Outlet', rank: 1, menuItemSku: 'COFFEE', menuItemName: 'Coffee', quantitySold: 6, revenueCents: 2_250 },
      { outletId: outletIds.MAIN, outletName: 'Main Outlet', rank: 2, menuItemSku: 'MUFFIN', menuItemName: 'Muffin', quantitySold: 2, revenueCents: 600 },
      { outletId: outletIds.MAIN, outletName: 'Main Outlet', rank: 3, menuItemSku: 'BURGER', menuItemName: 'Burger', quantitySold: 1, revenueCents: 1_100 },
      { outletId: outletIds.MAIN, outletName: 'Main Outlet', rank: 4, menuItemSku: 'SANDWICH', menuItemName: 'Sandwich', quantitySold: 1, revenueCents: 900 },
      { outletId: outletIds.MAIN, outletName: 'Main Outlet', rank: 5, menuItemSku: 'CROISSANT', menuItemName: 'Croissant', quantitySold: 1, revenueCents: 400 },
      { outletId: outletIds.NORTH, outletName: 'North Outlet', rank: 1, menuItemSku: 'TEA', menuItemName: 'Tea', quantitySold: 4, revenueCents: 1_000 },
      { outletId: outletIds.NORTH, outletName: 'North Outlet', rank: 2, menuItemSku: 'BURGER', menuItemName: 'Burger', quantitySold: 2, revenueCents: 2_000 },
      { outletId: outletIds.NORTH, outletName: 'North Outlet', rank: 3, menuItemSku: 'CROISSANT', menuItemName: 'Croissant', quantitySold: 2, revenueCents: 800 },
      { outletId: outletIds.NORTH, outletName: 'North Outlet', rank: 4, menuItemSku: 'JUICE', menuItemName: 'Juice', quantitySold: 2, revenueCents: 600 },
      { outletId: outletIds.NORTH, outletName: 'North Outlet', rank: 5, menuItemSku: 'SANDWICH', menuItemName: 'Sandwich', quantitySold: 1, revenueCents: 950 }
    ]);
  } finally {
    reportingRepository.outletRevenue = originalRevenue;
    reportingRepository.topSellingItems = originalTopItems;
  }
});

test('a narrower date range excludes seeded sales outside the window', async () => {
  const originalRevenue = reportingRepository.outletRevenue;
  const range: DateRange = {
    from: new Date('2026-01-06T00:00:00.000Z'),
    to: new Date('2026-01-06T23:59:59.999Z')
  };

  try {
    reportingRepository.outletRevenue = async (_client, from, to) =>
      aggregateOutletRevenue(from, to);

    assert.deepEqual(await reportingService.getRevenueByOutlet(range), [
      { outletId: outletIds.NORTH, outletName: 'North Outlet', revenueCents: 3_900, transactionCount: 2 },
      { outletId: outletIds.MAIN, outletName: 'Main Outlet', revenueCents: 3_250, transactionCount: 2 }
    ]);
  } finally {
    reportingRepository.outletRevenue = originalRevenue;
  }
});
