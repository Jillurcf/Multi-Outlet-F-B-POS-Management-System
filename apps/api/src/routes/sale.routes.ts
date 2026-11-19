import {
  createSaleBodySchema,
  createSaleHeadersSchema,
  listSalesQuerySchema,
  saleIdParamSchema
} from '@pos/shared';
import { Router } from 'express';
import { saleController } from '../controllers/sale.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';

export const saleRouter = Router();

saleRouter.use(authenticate, authorize('OUTLET_STAFF'));

saleRouter.post(
  '/',
  validate(createSaleHeadersSchema, 'headers'),
  validate(createSaleBodySchema, 'body'),
  saleController.create
);
saleRouter.get('/', validate(listSalesQuerySchema, 'query'), saleController.listForOutlet);
saleRouter.get(
  '/:saleId/receipt',
  validate(saleIdParamSchema, 'params'),
  saleController.getReceiptForOutlet
);
saleRouter.get('/:saleId', validate(saleIdParamSchema, 'params'), saleController.getForOutlet);
