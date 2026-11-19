import type { SaleDto } from '@pos/shared';
import type { SaleRecord } from '../repositories/sale.repository';

export function toSaleDto(record: SaleRecord): SaleDto {
  return {
    id: record.id,
    outletId: record.outletId,
    outletName: record.outlet.name,
    cashierName: record.cashier.fullName,
    receiptNumber: record.receiptNumber,
    totalCents: record.totalCents,
    createdAt: record.createdAt.toISOString(),
    items: record.saleItems.map((item) => ({
      id: item.id,
      outletMenuItemId: item.outletMenuItemId,
      menuItemName: item.menuItemName,
      menuItemSku: item.menuItemSku,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      lineTotalCents: item.lineTotalCents
    }))
  };
}
