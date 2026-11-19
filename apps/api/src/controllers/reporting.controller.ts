import type { PaginationQuery } from '@pos/shared';
import type { RequestHandler } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler';
import { getValidated } from '../middlewares/validate';
import { reportingService, type DateRange } from '../services/reporting.service';

export const reportingController = {
  dailySales: asyncHandler(async (req, res): Promise<void> => {
    const range = getValidated<DateRange>(res, 'query');
    res.status(200).json(await reportingService.getDailySales(range));
  }) satisfies RequestHandler,

  salesSummary: asyncHandler(async (req, res): Promise<void> => {
    const range = getValidated<DateRange>(res, 'query');
    res.status(200).json(await reportingService.getSalesSummary(range));
  }) satisfies RequestHandler,

  revenueByOutlet: asyncHandler(async (req, res): Promise<void> => {
    const range = getValidated<DateRange>(res, 'query');
    res.status(200).json(await reportingService.getRevenueByOutlet(range));
  }) satisfies RequestHandler,

  transactionCountByOutlet: asyncHandler(async (req, res): Promise<void> => {
    const range = getValidated<DateRange>(res, 'query');
    res.status(200).json(await reportingService.getTransactionCountByOutlet(range));
  }) satisfies RequestHandler,

  topSellingItems: asyncHandler(async (req, res): Promise<void> => {
    const range = getValidated<DateRange>(res, 'query');
    res.status(200).json(await reportingService.getTopSellingItems(range));
  }) satisfies RequestHandler,

  lowStock: asyncHandler(async (req, res): Promise<void> => {
    const { page, limit } = getValidated<PaginationQuery>(res, 'query');
    res.status(200).json(await reportingService.getLowStock(page, limit));
  }) satisfies RequestHandler
};
