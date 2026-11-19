import type { PaginationQuery } from '@pos/shared';
import type { Request, RequestHandler } from 'express';
import { UnauthorizedError } from '../errors/AppError';
import { asyncHandler } from '../middlewares/asyncHandler';
import { getValidated } from '../middlewares/validate';
import {
  inventoryService,
  type AddStockInput,
  type UpdateInventoryInput
} from '../services/inventory.service';
import { requireOutletId } from '../utils/authContext';

interface OutletMenuItemIdParams {
  outletMenuItemId: string;
}

interface ListMovementsQuery extends PaginationQuery {
  outletMenuItemId?: string;
}

function requireUserId(req: Request): string {
  if (!req.auth) {
    throw new UnauthorizedError('Authentication required');
  }

  return req.auth.userId;
}

export const inventoryController = {
  listForOutlet: asyncHandler(async (req, res): Promise<void> => {
    const { page, limit } = getValidated<PaginationQuery>(res, 'query');
    res.status(200).json(await inventoryService.listForOutlet(requireOutletId(req), page, limit));
  }) satisfies RequestHandler,

  listMovements: asyncHandler(async (req, res): Promise<void> => {
    const { page, limit, outletMenuItemId } = getValidated<ListMovementsQuery>(res, 'query');
    res
      .status(200)
      .json(
        await inventoryService.listMovementsForOutlet(
          requireOutletId(req),
          outletMenuItemId,
          page,
          limit
        )
      );
  }) satisfies RequestHandler,

  addStock: asyncHandler(async (req, res): Promise<void> => {
    const { outletMenuItemId } = getValidated<OutletMenuItemIdParams>(res, 'params');
    const body = getValidated<AddStockInput>(res, 'body');
    res
      .status(200)
      .json(
        await inventoryService.addStockForOutlet(
          requireOutletId(req),
          outletMenuItemId,
          body,
          requireUserId(req)
        )
      );
  }) satisfies RequestHandler,

  updateForOutlet: asyncHandler(async (req, res): Promise<void> => {
    const { outletMenuItemId } = getValidated<OutletMenuItemIdParams>(res, 'params');
    const body = getValidated<UpdateInventoryInput>(res, 'body');
    res
      .status(200)
      .json(
        await inventoryService.updateForOutlet(
          requireOutletId(req),
          outletMenuItemId,
          body,
          requireUserId(req)
        )
      );
  }) satisfies RequestHandler
};
