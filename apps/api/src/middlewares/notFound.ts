import type { Request, RequestHandler } from 'express';
import { NotFoundError } from '../errors/AppError';

export const notFound: RequestHandler = (req: Request, _res, next): void => {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`));
};
