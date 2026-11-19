import type { Request } from 'express';
import { ForbiddenError } from '../errors/AppError';

export function requireOutletId(req: Request): string {
  const outletId = req.auth?.outletId;

  if (!outletId) {
    throw new ForbiddenError('No outlet assigned to this account');
  }

  return outletId;
}
