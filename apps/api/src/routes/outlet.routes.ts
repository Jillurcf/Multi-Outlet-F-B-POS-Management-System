import {
  createOutletBodySchema,
  createOutletMenuItemBodySchema,
  idParamSchema,
  listOutletMenuItemsQuerySchema,
  listOutletsQuerySchema,
  outletIdParamSchema,
  outletMenuParamsSchema,
  updateOutletBodySchema,
  updateOutletMenuItemBodySchema
} from '@pos/shared';
import { Router } from 'express';
import { outletController } from '../controllers/outlet.controller';
import { outletMenuController } from '../controllers/outletMenu.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';

export const outletRouter = Router();

outletRouter.use(authenticate, authorize('HQ_ADMIN'));

outletRouter.get('/', validate(listOutletsQuerySchema, 'query'), outletController.list);
outletRouter.get('/:id', validate(idParamSchema, 'params'), outletController.getById);
outletRouter.post('/', validate(createOutletBodySchema, 'body'), outletController.create);
outletRouter.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updateOutletBodySchema, 'body'),
  outletController.update
);
outletRouter.delete('/:id', validate(idParamSchema, 'params'), outletController.deactivate);

outletRouter.get(
  '/:outletId/menu-items',
  validate(outletIdParamSchema, 'params'),
  validate(listOutletMenuItemsQuerySchema, 'query'),
  outletMenuController.listForOutlet
);
outletRouter.post(
  '/:outletId/menu-items',
  validate(outletIdParamSchema, 'params'),
  validate(createOutletMenuItemBodySchema, 'body'),
  outletMenuController.assign
);
outletRouter.patch(
  '/:outletId/menu-items/:menuItemId',
  validate(outletMenuParamsSchema, 'params'),
  validate(updateOutletMenuItemBodySchema, 'body'),
  outletMenuController.updateAssignment
);
outletRouter.delete(
  '/:outletId/menu-items/:menuItemId',
  validate(outletMenuParamsSchema, 'params'),
  outletMenuController.deactivateAssignment
);
