import {
  createMenuItemBodySchema,
  idParamSchema,
  listMenuItemsQuerySchema,
  updateMenuItemBodySchema
} from '@pos/shared';
import { Router } from 'express';
import { menuItemController } from '../controllers/menuItem.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';

export const menuItemRouter = Router();

menuItemRouter.use(authenticate, authorize('HQ_ADMIN'));

menuItemRouter.get('/', validate(listMenuItemsQuerySchema, 'query'), menuItemController.list);
menuItemRouter.get('/:id', validate(idParamSchema, 'params'), menuItemController.getById);
menuItemRouter.post('/', validate(createMenuItemBodySchema, 'body'), menuItemController.create);
menuItemRouter.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updateMenuItemBodySchema, 'body'),
  menuItemController.update
);
menuItemRouter.delete('/:id', validate(idParamSchema, 'params'), menuItemController.deactivate);
