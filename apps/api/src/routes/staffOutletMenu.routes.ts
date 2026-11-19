import { listOutletMenuItemsQuerySchema } from '@pos/shared';
import { Router } from 'express';
import { outletMenuController } from '../controllers/outletMenu.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';

export const staffOutletMenuRouter = Router();

staffOutletMenuRouter.use(authenticate, authorize('OUTLET_STAFF'));

staffOutletMenuRouter.get(
  '/',
  validate(listOutletMenuItemsQuerySchema, 'query'),
  outletMenuController.listAvailableForOutlet
);
