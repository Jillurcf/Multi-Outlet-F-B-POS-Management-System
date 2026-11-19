import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodTypeAny } from 'zod';
import { ValidationError } from '../errors/AppError';

export type ValidationSource = 'body' | 'query' | 'params' | 'headers';

type ValidatedStore = Record<ValidationSource, unknown>;

function validatedStore(res: Response): ValidatedStore {
  const existing = res.locals.validated as ValidatedStore | undefined;
  if (existing) {
    return existing;
  }

  const created: ValidatedStore = {
    body: undefined,
    query: undefined,
    params: undefined,
    headers: undefined
  };
  res.locals.validated = created;
  return created;
}

export function validate(schema: ZodTypeAny, source: ValidationSource = 'body'): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      next(new ValidationError(result.error.flatten()));
      return;
    }

    validatedStore(res)[source] = result.data;
    next();
  };
}

export function getValidated<T>(res: Response, source: ValidationSource): T {
  const value = validatedStore(res)[source];
  if (value === undefined) {
    throw new Error(`No validated ${source} data found`);
  }
  return value as T;
}
