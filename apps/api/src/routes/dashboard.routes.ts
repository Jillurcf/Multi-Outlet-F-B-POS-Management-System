import { Router } from 'express';
import { dashboardController } from '../controllers/dashboard.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';

export const dashboardRouter = Router();

dashboardRouter.get('/hq', authenticate, authorize('HQ_ADMIN'), dashboardController.hq);
dashboardRouter.get('/outlet', authenticate, authorize('OUTLET_STAFF'), dashboardController.outlet);
