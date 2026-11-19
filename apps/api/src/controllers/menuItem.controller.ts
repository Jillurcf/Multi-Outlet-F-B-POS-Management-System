import type { PaginationQuery } from '@pos/shared';
import type { RequestHandler } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler';
import { getValidated } from '../middlewares/validate';
import {
  menuItemService,
  type CreateMenuItemInput,
  type UpdateMenuItemInput
} from '../services/menuItem.service';

interface IdParams {
  id: string;
}

export const menuItemController = {
  list: asyncHandler(async (_req, res): Promise<void> => {
    const { page, limit } = getValidated<PaginationQuery>(res, 'query');
    res.status(200).json(await menuItemService.list(page, limit));
  }) satisfies RequestHandler,

  getById: asyncHandler(async (req, res): Promise<void> => {
    const { id } = getValidated<IdParams>(res, 'params');
    res.status(200).json(await menuItemService.getById(id));
  }) satisfies RequestHandler,

  create: asyncHandler(async (_req, res): Promise<void> => {
    const body = getValidated<CreateMenuItemInput>(res, 'body');
    res.status(201).json(await menuItemService.create(body));
  }) satisfies RequestHandler,

  update: asyncHandler(async (req, res): Promise<void> => {
    const { id } = getValidated<IdParams>(res, 'params');
    const body = getValidated<UpdateMenuItemInput>(res, 'body');
    res.status(200).json(await menuItemService.update(id, body));
  }) satisfies RequestHandler,

  deactivate: asyncHandler(async (req, res): Promise<void> => {
    const { id } = getValidated<IdParams>(res, 'params');
    await menuItemService.deactivate(id);
    res.status(204).send();
  }) satisfies RequestHandler
};
