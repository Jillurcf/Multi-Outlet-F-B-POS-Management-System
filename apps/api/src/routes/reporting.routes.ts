import { lowStockQuerySchema, salesReportQuerySchema } from '@pos/shared';
import { Router } from 'express';
import { reportingController } from '../controllers/reporting.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';

export const reportingRouter = Router();

reportingRouter.use(authenticate, authorize('HQ_ADMIN'));

reportingRouter.get(
  '/sales/daily',
  validate(salesReportQuerySchema, 'query'),
  reportingController.dailySales
);
reportingRouter.get(
  '/sales/summary',
  validate(salesReportQuerySchema, 'query'),
  reportingController.salesSummary
);
reportingRouter.get(
  '/revenue/by-outlet',
  validate(salesReportQuerySchema, 'query'),
  reportingController.revenueByOutlet
);
reportingRouter.get(
  '/transactions/by-outlet',
  validate(salesReportQuerySchema, 'query'),
  reportingController.transactionCountByOutlet
);
reportingRouter.get(
  '/top-items',
  validate(salesReportQuerySchema, 'query'),
  reportingController.topSellingItems
);
reportingRouter.get(
  '/low-stock',
  validate(lowStockQuerySchema, 'query'),
  reportingController.lowStock
);
