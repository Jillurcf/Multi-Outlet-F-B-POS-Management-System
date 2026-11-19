import type { RequestHandler } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler';
import { getValidated } from '../middlewares/validate';
import { userService, type CreateStaffInput } from '../services/user.service';

export const userController = {
  createStaff: asyncHandler(async (_req, res): Promise<void> => {
    const body = getValidated<CreateStaffInput>(res, 'body');
    res.status(201).json(await userService.createStaff(body));
  }) satisfies RequestHandler
};
