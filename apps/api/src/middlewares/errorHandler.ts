import { Prisma } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import {
  AppError,
  BadRequestError,
  ConflictError,
  NotFoundError,
  ValidationError
} from '../errors/AppError';

function fromPrismaError(error: Prisma.PrismaClientKnownRequestError): AppError | null {
  switch (error.code) {
    case 'P2002':
      return new ConflictError('A resource with this value already exists', error.meta);
    case 'P2003':
      return new ConflictError('A related resource is missing or still in use', error.meta);
    case 'P2014':
      return new ConflictError('A required relation is missing', error.meta);
    case 'P2025':
      return new NotFoundError('Resource not found');
    case 'P2034':
      return new ConflictError('Write conflict detected, please retry');
    default:
      return null;
  }
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  let normalized: AppError;

  if (error instanceof AppError) {
    normalized = error;
  } else if (error instanceof SyntaxError && 'body' in error) {
    normalized = new BadRequestError('Invalid JSON body');
  } else if (error instanceof ZodError) {
    normalized = new ValidationError(error.flatten());
  } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
    normalized = fromPrismaError(error) ?? new AppError(500, 'INTERNAL_ERROR', 'Unexpected database error');
  } else {
    normalized = new AppError(500, 'INTERNAL_ERROR', 'Unexpected error');
  }

  if (normalized.statusCode >= 500) {
    console.error(error);
  }

  if (res.headersSent) {
    return;
  }

  res.status(normalized.statusCode).json({
    error: {
      code: normalized.code,
      message: normalized.message,
      ...(normalized.details === undefined ? {} : { details: normalized.details })
    }
  });
}
