import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { UnauthorizedError } from '../errors/AppError';
import { authService } from '../services/auth.service';
import { asyncHandler } from './asyncHandler';

interface AccessTokenPayload {
  sub?: string;
}

function extractToken(header: string | undefined): string {
  if (!header?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Bearer token required');
  }

  const token = header.slice('Bearer '.length).trim();

  if (!token) {
    throw new UnauthorizedError('Bearer token required');
  }

  return token;
}

export const authenticate: RequestHandler = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req.headers.authorization);
  let payload: AccessTokenPayload;

  try {
    payload = jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;
  } catch {
    throw new UnauthorizedError('Invalid or expired token');
  }

  if (!payload.sub) {
    throw new UnauthorizedError('Invalid token payload');
  }

  const user = await authService.getAuthUser(payload.sub);
  req.auth = { userId: user.id, role: user.role, outletId: user.outletId };
  next();
});
