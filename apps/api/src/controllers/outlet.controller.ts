import type { PaginationQuery } from '@pos/shared';
import type { RequestHandler } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler';
import { getValidated } from '../middlewares/validate';
import { outletService, type CreateOutletInput, type UpdateOutletInput } from '../services/outlet.service';

interface IdParams {
  id: string;
}

export const outletController = {
  list: asyncHandler(async (_req, res): Promise<void> => {
    const { page, limit } = getValidated<PaginationQuery>(res, 'query');
    res.status(200).json(await outletService.list(page, limit));
  }) satisfies RequestHandler,

  getById: asyncHandler(async (req, res): Promise<void> => {
    const { id } = getValidated<IdParams>(res, 'params');
    res.status(200).json(await outletService.getById(id));
  }) satisfies RequestHandler,

  create: asyncHandler(async (_req, res): Promise<void> => {
    const body = getValidated<CreateOutletInput>(res, 'body');
    res.status(201).json(await outletService.create(body));
  }) satisfies RequestHandler,

  update: asyncHandler(async (req, res): Promise<void> => {
    const { id } = getValidated<IdParams>(res, 'params');
    const body = getValidated<UpdateOutletInput>(res, 'body');
    res.status(200).json(await outletService.update(id, body));
  }) satisfies RequestHandler,

  deactivate: asyncHandler(async (req, res): Promise<void> => {
    const { id } = getValidated<IdParams>(res, 'params');
    await outletService.deactivate(id);
    res.status(204).send();
  }) satisfies RequestHandler
};
