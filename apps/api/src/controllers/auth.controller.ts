import type { RequestHandler } from 'express';
import { UnauthorizedError } from '../errors/AppError';
import { asyncHandler } from '../middlewares/asyncHandler';
import { getValidated } from '../middlewares/validate';
import { authService } from '../services/auth.service';

interface LoginInput {
  email: string;
  password: string;
}

export const authController = {
  login: asyncHandler(async (_req, res): Promise<void> => {
    const { email, password } = getValidated<LoginInput>(res, 'body');
    res.status(200).json(await authService.login(email, password));
  }) satisfies RequestHandler,

  me: asyncHandler(async (req, res): Promise<void> => {
    if (!req.auth) {
      throw new UnauthorizedError();
    }

    res.status(200).json(await authService.getAuthUser(req.auth.userId));
  }) satisfies RequestHandler
};
