import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NotFoundError } from '../src/errors/AppError';
import { menuItemRepository } from '../src/repositories/menuItem.repository';
import { outletRepository } from '../src/repositories/outlet.repository';
import {
  reportingRepository,
  type DailySalesRow,
  type LowStockRow,
  type SalesSummaryRow
} from '../src/repositories/reporting.repository';
import { saleRepository, type SaleRecord } from '../src/repositories/sale.repository';
import { reportingService } from '../src/services/reporting.service';

const outletId = '00000000-0000-4000-8000-000000000030';
const saleId = '00000000-0000-4000-8000-000000000031';

const saleRecord = {
  id: saleId,
  outletId,
  cashierId: '00000000-0000-4000-8000-000000000032',
  receiptNumber: 1,
  totalCents: 900,
  idempotencyKey: null,
  createdAt: new Date('2026-01-05T10:00:00.000Z'),
  outlet: {
    id: outletId,
    code: 'MAIN',
    name: 'Main',
    address: null,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z')
  },
  cashier: { fullName: 'Cashier One' },
  saleItems: []
} as SaleRecord;

const dailyRow: DailySalesRow = {
  day: new Date('2026-01-05T00:00:00.000Z'),
  outletId,
  outletName: 'Main',
  salesCount: 4,
  revenueCents: 3_600
};

const lowStockRow: LowStockRow = {
  outletMenuItemId: '00000000-0000-4000-8000-000000000033',
  outletId,
  outletName: 'Main',
  sku: 'COFFEE',
  name: 'Coffee',
  quantity: 2,
  lowStockThreshold: 5
};

test('HQ dashboard aggregates today metrics across all outlets', async () => {
  const originalCount = outletRepository.count;
  const originalCountActive = outletRepository.countActive;
  const originalMenuItemCountActive = menuItemRepository.countActive;
  const originalCountLowStock = reportingRepository.countLowStockItems;
  const originalSummary = reportingRepository.salesSummary;
  const originalLatest = saleRepository.findManyForRange;
  const summary: SalesSummaryRow = { salesCount: 12, revenueCents: 8_800 };
  let summaryOutletId: string | null | undefined;
  let latestOutletId: string | null | undefined;

  try {
    outletRepository.count = async () => 3;
    outletRepository.countActive = async () => 2;
    menuItemRepository.countActive = async () => 20;
    reportingRepository.countLowStockItems = async () => 4;
    reportingRepository.salesSummary = async (_client, outletId) => {
      summaryOutletId = outletId;
      return summary;
    };
    saleRepository.findManyForRange = async (_client, outletId) => {
      latestOutletId = outletId;
      return [saleRecord];
    };

    const result = await reportingService.getHqDashboard();

    assert.equal(result.totalOutlets, 3);
    assert.equal(result.activeOutlets, 2);
    assert.equal(result.activeMenuItems, 20);
    assert.equal(result.lowStockItemCount, 4);
    assert.equal(result.todaySalesCount, 12);
    assert.equal(result.todayRevenueCents, 8_800);
    assert.equal(result.latestSales[0]?.outletName, 'Main');
    assert.equal(summaryOutletId, null);
    assert.equal(latestOutletId, null);
  } finally {
    outletRepository.count = originalCount;
    outletRepository.countActive = originalCountActive;
    menuItemRepository.countActive = originalMenuItemCountActive;
    reportingRepository.countLowStockItems = originalCountLowStock;
    reportingRepository.salesSummary = originalSummary;
    saleRepository.findManyForRange = originalLatest;
  }
});

test('outlet dashboard scopes today metrics to the authenticated outlet', async () => {
  const originalFindOutlet = outletRepository.findById;
  const originalCountLowStock = reportingRepository.countLowStockItems;
  const originalSummary = reportingRepository.salesSummary;
  const originalLatest = saleRepository.findManyForRange;
  const seenOutletIds: Array<string | null> = [];

  try {
    outletRepository.findById = async () => ({
      id: outletId,
      code: 'MAIN',
      name: 'Main Outlet',
      address: null,
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z')
    });
    reportingRepository.countLowStockItems = async (_client, outletId) => {
      seenOutletIds.push(outletId);
      return 2;
    };
    reportingRepository.salesSummary = async (_client, outletId) => {
      seenOutletIds.push(outletId);
      return { salesCount: 5, revenueCents: 4_500 };
    };
    saleRepository.findManyForRange = async (_client, outletId) => {
      seenOutletIds.push(outletId);
      return [saleRecord];
    };

    const result = await reportingService.getOutletDashboard(outletId);

    assert.equal(result.outletId, outletId);
    assert.equal(result.outletName, 'Main Outlet');
    assert.equal(result.lowStockItemCount, 2);
    assert.equal(result.todaySalesCount, 5);
    assert.deepEqual(seenOutletIds, [outletId, outletId, outletId]);
  } finally {
    outletRepository.findById = originalFindOutlet;
    reportingRepository.countLowStockItems = originalCountLowStock;
    reportingRepository.salesSummary = originalSummary;
    saleRepository.findManyForRange = originalLatest;
  }
});

test('outlet dashboard rejects an unknown outlet', async () => {
  const originalFindOutlet = outletRepository.findById;
  outletRepository.findById = async () => null;

  try {
    await assert.rejects(() => reportingService.getOutletDashboard(outletId), NotFoundError);
  } finally {
    outletRepository.findById = originalFindOutlet;
  }
});

test('daily sales normalizes the range to UTC day boundaries', async () => {
  const originalDaily = reportingRepository.dailySalesByOutlet;
  let capturedFrom: Date | undefined;
  let capturedTo: Date | undefined;

  reportingRepository.dailySalesByOutlet = async (_client, from, to) => {
    capturedFrom = from;
    capturedTo = to;
    return [dailyRow];
  };

  try {
    const result = await reportingService.getDailySales({
      from: new Date('2026-01-05T01:00:00.000Z'),
      to: new Date('2026-01-05T02:00:00.000Z')
    });

    assert.equal(capturedFrom?.toISOString(), '2026-01-05T00:00:00.000Z');
    assert.equal(capturedTo?.toISOString(), '2026-01-05T23:59:59.999Z');
    assert.deepEqual(result, [
      {
        date: '2026-01-05T00:00:00.000Z',
        outletId,
        outletName: 'Main',
        salesCount: 4,
        revenueCents: 3_600
      }
    ]);
  } finally {
    reportingRepository.dailySalesByOutlet = originalDaily;
  }
});

test('sales summary returns normalized range boundaries and totals', async () => {
  const originalSummary = reportingRepository.salesSummary;

  reportingRepository.salesSummary = async () => ({ salesCount: 9, revenueCents: 7_200 });

  try {
    const result = await reportingService.getSalesSummary({
      from: new Date('2026-01-06T08:00:00.000Z'),
      to: new Date('2026-01-07T09:00:00.000Z')
    });

    assert.equal(result.from, '2026-01-06T00:00:00.000Z');
    assert.equal(result.to, '2026-01-07T23:59:59.999Z');
    assert.equal(result.salesCount, 9);
    assert.equal(result.revenueCents, 7_200);
  } finally {
    reportingRepository.salesSummary = originalSummary;
  }
});

test('HQ outlet reports normalize the range and request the top five items', async () => {
  const originalRevenue = reportingRepository.outletRevenue;
  const originalTopItems = reportingRepository.topSellingItems;
  const ranges: Array<{ from: string; to: string }> = [];
  let capturedLimit: number | undefined;

  reportingRepository.outletRevenue = async (_client, from, to) => {
    ranges.push({ from: from.toISOString(), to: to.toISOString() });
    return [];
  };
  reportingRepository.topSellingItems = async (_client, from, to, limit) => {
    ranges.push({ from: from.toISOString(), to: to.toISOString() });
    capturedLimit = limit;
    return [];
  };

  try {
    const range = {
      from: new Date('2026-01-05T01:00:00.000Z'),
      to: new Date('2026-01-06T02:00:00.000Z')
    };

    assert.deepEqual(await reportingService.getRevenueByOutlet(range), []);
    assert.deepEqual(await reportingService.getTransactionCountByOutlet(range), []);
    assert.deepEqual(await reportingService.getTopSellingItems(range), []);
    assert.deepEqual(ranges, [
      { from: '2026-01-05T00:00:00.000Z', to: '2026-01-06T23:59:59.999Z' },
      { from: '2026-01-05T00:00:00.000Z', to: '2026-01-06T23:59:59.999Z' },
      { from: '2026-01-05T00:00:00.000Z', to: '2026-01-06T23:59:59.999Z' }
    ]);
    assert.equal(capturedLimit, 5);
  } finally {
    reportingRepository.outletRevenue = originalRevenue;
    reportingRepository.topSellingItems = originalTopItems;
  }
});

test('low stock report passes pagination and maps rows', async () => {
  const originalLowStock = reportingRepository.lowStockItems;
  const originalCount = reportingRepository.countLowStockItems;
  let capturedSkip: number | undefined;
  let capturedTake: number | undefined;

  reportingRepository.lowStockItems = async (_client, _outletId, skip, take) => {
    capturedSkip = skip;
    capturedTake = take;
    return [lowStockRow];
  };
  reportingRepository.countLowStockItems = async () => 3;

  try {
    const result = await reportingService.getLowStock(2, 2);

    assert.equal(capturedSkip, 2);
    assert.equal(capturedTake, 2);
    assert.equal(result.totalPages, 2);
    assert.deepEqual(result.items[0], {
      outletMenuItemId: lowStockRow.outletMenuItemId,
      outletId,
      outletName: 'Main',
      sku: 'COFFEE',
      name: 'Coffee',
      quantity: 2,
      lowStockThreshold: 5
    });
  } finally {
    reportingRepository.lowStockItems = originalLowStock;
    reportingRepository.countLowStockItems = originalCount;
  }
});
