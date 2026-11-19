import {
  addStockBodySchema,
  listInventoryQuerySchema,
  listStockMovementsQuerySchema,
  outletMenuItemIdParamSchema,
  updateInventoryBodySchema
} from '@pos/shared';
import { Router } from 'express';
import { inventoryController } from '../controllers/inventory.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';

export const inventoryRouter = Router();

inventoryRouter.use(authenticate, authorize('OUTLET_STAFF'));

inventoryRouter.get('/movements', validate(listStockMovementsQuerySchema, 'query'), inventoryController.listMovements);
inventoryRouter.get('/', validate(listInventoryQuerySchema, 'query'), inventoryController.listForOutlet);
inventoryRouter.post(
  '/:outletMenuItemId/stock',
  validate(outletMenuItemIdParamSchema, 'params'),
  validate(addStockBodySchema, 'body'),
  inventoryController.addStock
);
inventoryRouter.patch(
  '/:outletMenuItemId',
  validate(outletMenuItemIdParamSchema, 'params'),
  validate(updateInventoryBodySchema, 'body'),
  inventoryController.updateForOutlet
);
