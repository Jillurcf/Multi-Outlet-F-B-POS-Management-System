import type { PaginationQuery } from '@pos/shared';
import type { RequestHandler } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler';
import { getValidated } from '../middlewares/validate';
import {
  outletMenuService,
  type AssignMenuItemInput,
  type UpdateAssignmentInput
} from '../services/outletMenu.service';
import { requireOutletId } from '../utils/authContext';

interface OutletIdParams {
  outletId: string;
}

interface OutletMenuParams extends OutletIdParams {
  menuItemId: string;
}

export const outletMenuController = {
  listForOutlet: asyncHandler(async (req, res): Promise<void> => {
    const { outletId } = getValidated<OutletIdParams>(res, 'params');
    const { page, limit } = getValidated<PaginationQuery>(res, 'query');
    res.status(200).json(await outletMenuService.listForOutlet(outletId, page, limit));
  }) satisfies RequestHandler,

  assign: asyncHandler(async (req, res): Promise<void> => {
    const { outletId } = getValidated<OutletIdParams>(res, 'params');
    const body = getValidated<AssignMenuItemInput>(res, 'body');
    res.status(201).json(await outletMenuService.assign(outletId, body));
  }) satisfies RequestHandler,

  updateAssignment: asyncHandler(async (req, res): Promise<void> => {
    const { outletId, menuItemId } = getValidated<OutletMenuParams>(res, 'params');
    const body = getValidated<UpdateAssignmentInput>(res, 'body');
    res.status(200).json(await outletMenuService.updateAssignment(outletId, menuItemId, body));
  }) satisfies RequestHandler,

  deactivateAssignment: asyncHandler(async (req, res): Promise<void> => {
    const { outletId, menuItemId } = getValidated<OutletMenuParams>(res, 'params');
    await outletMenuService.deactivateAssignment(outletId, menuItemId);
    res.status(204).send();
  }) satisfies RequestHandler,

  listAvailableForOutlet: asyncHandler(async (req, res): Promise<void> => {
    const { page, limit } = getValidated<PaginationQuery>(res, 'query');
    res
      .status(200)
      .json(await outletMenuService.listAvailableForOutlet(requireOutletId(req), page, limit));
  }) satisfies RequestHandler
};
