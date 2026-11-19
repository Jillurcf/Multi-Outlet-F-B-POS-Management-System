export type SeedOutletCode = 'MAIN' | 'NORTH';

export interface SeedMenuItem {
  id: string;
  sku: string;
  name: string;
  category: string;
  currentPriceCents: number;
}

export interface SeedOutletMenuItem {
  id: string;
  outletCode: SeedOutletCode;
  sku: string;
  priceCents: number;
  quantity: number;
  lowStockThreshold: number;
}

export interface SeedSaleItem {
  sku: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
}

export interface SeedSale {
  id: string;
  outletCode: SeedOutletCode;
  cashierEmail: string;
  receiptNumber: number;
  createdAt: string;
  totalCents: number;
  items: SeedSaleItem[];
}

export const seedReportRange = {
  from: '2026-01-05T00:00:00.000Z',
  to: '2026-01-06T23:59:59.999Z'
} as const;

export const seedMenuItems: SeedMenuItem[] = [
  { id: '00000000-0000-4000-8000-000000000101', sku: 'COFFEE', name: 'Coffee', category: 'Beverages', currentPriceCents: 500 },
  { id: '00000000-0000-4000-8000-000000000102', sku: 'CROISSANT', name: 'Croissant', category: 'Bakery', currentPriceCents: 450 },
  { id: '00000000-0000-4000-8000-000000000103', sku: 'BURGER', name: 'Burger', category: 'Food', currentPriceCents: 1200 },
  { id: '00000000-0000-4000-8000-000000000104', sku: 'TEA', name: 'Tea', category: 'Beverages', currentPriceCents: 300 },
  { id: '00000000-0000-4000-8000-000000000105', sku: 'MUFFIN', name: 'Muffin', category: 'Bakery', currentPriceCents: 400 },
  { id: '00000000-0000-4000-8000-000000000106', sku: 'JUICE', name: 'Juice', category: 'Beverages', currentPriceCents: 350 },
  { id: '00000000-0000-4000-8000-000000000107', sku: 'SANDWICH', name: 'Sandwich', category: 'Food', currentPriceCents: 1100 }
];

const outletMenuIds: Record<SeedOutletCode, number> = { MAIN: 200, NORTH: 207 };

export const seedOutletMenuItems: SeedOutletMenuItem[] = (['MAIN', 'NORTH'] as const).flatMap(
  (outletCode) =>
    seedMenuItems.map((item, index) => ({
      id: `00000000-0000-4000-8000-${String(outletMenuIds[outletCode] + index + 1).padStart(12, '0')}`,
      outletCode,
      sku: item.sku,
      priceCents: item.currentPriceCents,
      quantity: 100,
      lowStockThreshold: 5
    }))
);

export const seedSales: SeedSale[] = [
  {
    id: '00000000-0000-4000-8000-000000000301',
    outletCode: 'MAIN',
    cashierEmail: 'staff.main@example.com',
    receiptNumber: 1,
    createdAt: '2026-01-05T09:00:00.000Z',
    totalCents: 1100,
    items: [
      { sku: 'COFFEE', name: 'Coffee', quantity: 2, unitPriceCents: 350 },
      { sku: 'CROISSANT', name: 'Croissant', quantity: 1, unitPriceCents: 400 }
    ]
  },
  {
    id: '00000000-0000-4000-8000-000000000302',
    outletCode: 'MAIN',
    cashierEmail: 'staff.main@example.com',
    receiptNumber: 2,
    createdAt: '2026-01-05T14:00:00.000Z',
    totalCents: 1450,
    items: [
      { sku: 'BURGER', name: 'Burger', quantity: 1, unitPriceCents: 1100 },
      { sku: 'COFFEE', name: 'Coffee', quantity: 1, unitPriceCents: 350 }
    ]
  },
  {
    id: '00000000-0000-4000-8000-000000000303',
    outletCode: 'MAIN',
    cashierEmail: 'staff.main@example.com',
    receiptNumber: 3,
    createdAt: '2026-01-06T10:00:00.000Z',
    totalCents: 1500,
    items: [
      { sku: 'COFFEE', name: 'Coffee', quantity: 3, unitPriceCents: 400 },
      { sku: 'TEA', name: 'Tea', quantity: 1, unitPriceCents: 300 }
    ]
  },
  {
    id: '00000000-0000-4000-8000-000000000304',
    outletCode: 'MAIN',
    cashierEmail: 'staff.main@example.com',
    receiptNumber: 4,
    createdAt: '2026-01-06T16:00:00.000Z',
    totalCents: 1750,
    items: [
      { sku: 'MUFFIN', name: 'Muffin', quantity: 2, unitPriceCents: 300 },
      { sku: 'JUICE', name: 'Juice', quantity: 1, unitPriceCents: 250 },
      { sku: 'SANDWICH', name: 'Sandwich', quantity: 1, unitPriceCents: 900 }
    ]
  },
  {
    id: '00000000-0000-4000-8000-000000000305',
    outletCode: 'MAIN',
    cashierEmail: 'staff.main@example.com',
    receiptNumber: 5,
    createdAt: '2025-12-31T10:00:00.000Z',
    totalCents: 4500,
    items: [{ sku: 'BURGER', name: 'Burger', quantity: 5, unitPriceCents: 900 }]
  },
  {
    id: '00000000-0000-4000-8000-000000000311',
    outletCode: 'NORTH',
    cashierEmail: 'staff.north@example.com',
    receiptNumber: 1,
    createdAt: '2026-01-05T11:00:00.000Z',
    totalCents: 1800,
    items: [
      { sku: 'TEA', name: 'Tea', quantity: 4, unitPriceCents: 250 },
      { sku: 'CROISSANT', name: 'Croissant', quantity: 2, unitPriceCents: 400 }
    ]
  },
  {
    id: '00000000-0000-4000-8000-000000000312',
    outletCode: 'NORTH',
    cashierEmail: 'staff.north@example.com',
    receiptNumber: 2,
    createdAt: '2026-01-06T12:00:00.000Z',
    totalCents: 2000,
    items: [{ sku: 'BURGER', name: 'Burger', quantity: 2, unitPriceCents: 1000 }]
  },
  {
    id: '00000000-0000-4000-8000-000000000313',
    outletCode: 'NORTH',
    cashierEmail: 'staff.north@example.com',
    receiptNumber: 3,
    createdAt: '2026-01-06T15:00:00.000Z',
    totalCents: 1900,
    items: [
      { sku: 'MUFFIN', name: 'Muffin', quantity: 1, unitPriceCents: 350 },
      { sku: 'SANDWICH', name: 'Sandwich', quantity: 1, unitPriceCents: 950 },
      { sku: 'JUICE', name: 'Juice', quantity: 2, unitPriceCents: 300 }
    ]
  },
  {
    id: '00000000-0000-4000-8000-000000000314',
    outletCode: 'NORTH',
    cashierEmail: 'staff.north@example.com',
    receiptNumber: 4,
    createdAt: '2026-01-08T10:00:00.000Z',
    totalCents: 2400,
    items: [{ sku: 'COFFEE', name: 'Coffee', quantity: 6, unitPriceCents: 400 }]
  }
];

export function seedLineTotalCents(item: SeedSaleItem): number {
  return item.quantity * item.unitPriceCents;
}
