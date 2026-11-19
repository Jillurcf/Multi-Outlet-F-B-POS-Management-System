import type { RequestHandler } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler';
import { healthService } from '../services/health.service';

export const healthController = {
  getStatus: asyncHandler(async (_req, res): Promise<void> => {
    res.status(200).json(await healthService.getStatus());
  }) satisfies RequestHandler
};
