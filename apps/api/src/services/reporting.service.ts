import type {
  DailySalesDto,
  HqDashboardDto,
  LowStockItemDto,
  OutletDashboardDto,
  OutletRevenueDto,
  OutletTransactionCountDto,
  Paginated,
  SalesSummaryDto,
  TopSellingItemDto
} from '@pos/shared';
import { prisma } from '../config/prisma';
import { NotFoundError } from '../errors/AppError';
import { toSaleDto } from '../mappers/sale.mapper';
import { menuItemRepository } from '../repositories/menuItem.repository';
import { outletRepository } from '../repositories/outlet.repository';
import {
  reportingRepository,
  type DailySalesRow,
  type LowStockRow,
  type OutletRevenueRow,
  type TopSellingItemRow
} from '../repositories/reporting.repository';
import { saleRepository } from '../repositories/sale.repository';

export interface DateRange {
  from: Date;
  to: Date;
}

const TOP_ITEMS_LIMIT = 5;

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function endOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999)
  );
}

function normalizeRange(range: DateRange): DateRange {
  return {
    from: startOfUtcDay(range.from),
    to: endOfUtcDay(range.to)
  };
}

function todayRange(): DateRange {
  const now = new Date();
  return {
    from: startOfUtcDay(now),
    to: endOfUtcDay(now)
  };
}

function mapDailySales(row: DailySalesRow): DailySalesDto {
  return {
    date: row.day.toISOString(),
    outletId: row.outletId,
    outletName: row.outletName,
    salesCount: row.salesCount,
    revenueCents: row.revenueCents
  };
}

function mapOutletRevenue(row: OutletRevenueRow): OutletRevenueDto {
  return {
    outletId: row.outletId,
    outletName: row.outletName,
    revenueCents: row.revenueCents,
    transactionCount: row.transactionCount
  };
}

function mapTopSellingItem(row: TopSellingItemRow): TopSellingItemDto {
  return {
    outletId: row.outletId,
    outletName: row.outletName,
    rank: row.rank,
    menuItemSku: row.menuItemSku,
    menuItemName: row.menuItemName,
    quantitySold: row.quantitySold,
    revenueCents: row.revenueCents
  };
}

function mapLowStock(row: LowStockRow): LowStockItemDto {
  return {
    outletMenuItemId: row.outletMenuItemId,
    outletId: row.outletId,
    outletName: row.outletName,
    sku: row.sku,
    name: row.name,
    quantity: row.quantity,
    lowStockThreshold: row.lowStockThreshold
  };
}

export const reportingService = {
  async getHqDashboard(): Promise<HqDashboardDto> {
    const range = todayRange();
    const [totalOutlets, activeOutlets, activeMenuItems, lowStockItemCount, summary, latestSales] =
      await Promise.all([
        outletRepository.count(),
        outletRepository.countActive(),
        menuItemRepository.countActive(),
        reportingRepository.countLowStockItems(prisma, null),
        reportingRepository.salesSummary(prisma, null, range.from, range.to),
        saleRepository.findManyForRange(prisma, null, range.from, range.to, 5)
      ]);

    return {
      totalOutlets,
      activeOutlets,
      activeMenuItems,
      lowStockItemCount,
      todaySalesCount: summary.salesCount,
      todayRevenueCents: summary.revenueCents,
      latestSales: latestSales.map(toSaleDto)
    };
  },

  async getOutletDashboard(outletId: string): Promise<OutletDashboardDto> {
    const outlet = await outletRepository.findById(outletId);

    if (!outlet) {
      throw new NotFoundError('Outlet not found');
    }

    const range = todayRange();
    const [lowStockItemCount, summary, latestSales] = await Promise.all([
      reportingRepository.countLowStockItems(prisma, outletId),
      reportingRepository.salesSummary(prisma, outletId, range.from, range.to),
      saleRepository.findManyForRange(prisma, outletId, range.from, range.to, 5)
    ]);

    return {
      outletId: outlet.id,
      outletName: outlet.name,
      lowStockItemCount,
      todaySalesCount: summary.salesCount,
      todayRevenueCents: summary.revenueCents,
      latestSales: latestSales.map(toSaleDto)
    };
  },

  async getDailySales(range: DateRange): Promise<DailySalesDto[]> {
    const normalized = normalizeRange(range);
    const rows = await reportingRepository.dailySalesByOutlet(
      prisma,
      normalized.from,
      normalized.to
    );

    return rows.map(mapDailySales);
  },

  async getSalesSummary(range: DateRange): Promise<SalesSummaryDto> {
    const normalized = normalizeRange(range);
    const summary = await reportingRepository.salesSummary(
      prisma,
      null,
      normalized.from,
      normalized.to
    );

    return {
      from: normalized.from.toISOString(),
      to: normalized.to.toISOString(),
      ...summary
    };
  },

  async getRevenueByOutlet(range: DateRange): Promise<OutletRevenueDto[]> {
    const normalized = normalizeRange(range);
    const rows = await reportingRepository.outletRevenue(
      prisma,
      normalized.from,
      normalized.to
    );

    return rows.map(mapOutletRevenue);
  },

  async getTransactionCountByOutlet(range: DateRange): Promise<OutletTransactionCountDto[]> {
    const normalized = normalizeRange(range);
    const rows = await reportingRepository.outletRevenue(
      prisma,
      normalized.from,
      normalized.to
    );

    return rows.map((row) => ({
      outletId: row.outletId,
      outletName: row.outletName,
      transactionCount: row.transactionCount
    }));
  },

  async getTopSellingItems(range: DateRange): Promise<TopSellingItemDto[]> {
    const normalized = normalizeRange(range);
    const rows = await reportingRepository.topSellingItems(
      prisma,
      normalized.from,
      normalized.to,
      TOP_ITEMS_LIMIT
    );

    return rows.map(mapTopSellingItem);
  },

  async getLowStock(page: number, limit: number): Promise<Paginated<LowStockItemDto>> {
    const [rows, total] = await Promise.all([
      reportingRepository.lowStockItems(prisma, null, (page - 1) * limit, limit),
      reportingRepository.countLowStockItems(prisma, null)
    ]);

    return {
      items: rows.map(mapLowStock),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }
};
