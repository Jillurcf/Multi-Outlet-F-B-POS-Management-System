import type { RequestHandler } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler';
import { reportingService } from '../services/reporting.service';
import { requireOutletId } from '../utils/authContext';

export const dashboardController = {
  hq: asyncHandler(async (_req, res): Promise<void> => {
    res.status(200).json(await reportingService.getHqDashboard());
  }) satisfies RequestHandler,

  outlet: asyncHandler(async (req, res): Promise<void> => {
    res.status(200).json(await reportingService.getOutletDashboard(requireOutletId(req)));
  }) satisfies RequestHandler
};
