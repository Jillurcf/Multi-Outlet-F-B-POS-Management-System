import type { PaginationQuery } from '@pos/shared';
import type { Request, RequestHandler } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler';
import { getValidated } from '../middlewares/validate';
import { UnauthorizedError } from '../errors/AppError';
import { saleService, type SaleItemInput } from '../services/sale.service';
import { requireOutletId } from '../utils/authContext';

interface CreateSaleBody {
  items: SaleItemInput[];
}

interface CreateSaleHeaders {
  'idempotency-key'?: string;
}

interface SaleIdParams {
  saleId: string;
}

function requireUserId(req: Request): string {
  if (!req.auth) {
    throw new UnauthorizedError('Authentication required');
  }

  return req.auth.userId;
}

export const saleController = {
  create: asyncHandler(async (req, res): Promise<void> => {
    const { items } = getValidated<CreateSaleBody>(res, 'body');
    const { 'idempotency-key': idempotencyKey } = getValidated<CreateSaleHeaders>(res, 'headers');
    const sale = await saleService.createSale(
      requireOutletId(req),
      requireUserId(req),
      items,
      idempotencyKey
    );
    res.status(201).json(sale);
  }) satisfies RequestHandler,

  listForOutlet: asyncHandler(async (req, res): Promise<void> => {
    const { page, limit } = getValidated<PaginationQuery>(res, 'query');
    res.status(200).json(await saleService.listForOutlet(requireOutletId(req), page, limit));
  }) satisfies RequestHandler,

  getForOutlet: asyncHandler(async (req, res): Promise<void> => {
    const { saleId } = getValidated<SaleIdParams>(res, 'params');
    res.status(200).json(await saleService.getByIdForOutlet(saleId, requireOutletId(req)));
  }) satisfies RequestHandler,

  getReceiptForOutlet: asyncHandler(async (req, res): Promise<void> => {
    const { saleId } = getValidated<SaleIdParams>(res, 'params');
    res.status(200).json(await saleService.getReceiptForOutlet(saleId, requireOutletId(req)));
  }) satisfies RequestHandler
};
