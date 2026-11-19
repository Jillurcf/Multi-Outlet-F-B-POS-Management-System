import type { Role } from '@pos/shared';
import type { RequestHandler } from 'express';
import { ForbiddenError, UnauthorizedError } from '../errors/AppError';

export function authorize(...roles: Role[]): RequestHandler {
  return (req, _res, next): void => {
    if (!req.auth) {
      next(new UnauthorizedError());
      return;
    }

    if (!roles.includes(req.auth.role)) {
      next(new ForbiddenError());
      return;
    }

    next();
  };
}
