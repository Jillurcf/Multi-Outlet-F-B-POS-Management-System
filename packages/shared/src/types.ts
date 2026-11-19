export type Role = 'HQ_ADMIN' | 'OUTLET_STAFF';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  outletId: string | null;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export interface OutletDto {
  id: string;
  code: string;
  name: string;
  address: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MenuItemDto {
  id: string;
  sku: string;
  name: string;
  category: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OutletMenuItemDto {
  id: string;
  outletId: string;
  menuItemId: string;
  sku: string;
  name: string;
  category: string;
  description: string | null;
  priceCents: number;
  isAvailable: boolean;
  quantity: number;
  lowStockThreshold: number;
  createdAt: string;
  updatedAt: string;
}

export interface OutletInventoryDto {
  id: string;
  outletMenuItemId: string;
  menuItemId: string;
  sku: string;
  name: string;
  priceCents: number;
  quantity: number;
  lowStockThreshold: number;
  updatedAt: string;
}

export interface StockMovementDto {
  id: string;
  outletId: string;
  outletMenuItemId: string;
  sku: string;
  name: string;
  movementType: 'RESTOCK' | 'ADJUSTMENT' | 'SALE';
  quantityBefore: number;
  quantityChange: number;
  quantityAfter: number;
  actorUserId: string | null;
  saleId: string | null;
  note: string | null;
  createdAt: string;
}

export interface SaleItemDto {
  id: string;
  outletMenuItemId: string;
  menuItemName: string;
  menuItemSku: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

export interface SaleDto {
  id: string;
  outletId: string;
  outletName: string;
  cashierName: string;
  receiptNumber: number;
  totalCents: number;
  createdAt: string;
  items: SaleItemDto[];
}

export interface ReceiptDto extends SaleDto {
  receiptTitle: string;
}

export interface SalesSummaryDto {
  from: string;
  to: string;
  salesCount: number;
  revenueCents: number;
}

export interface DailySalesDto {
  date: string;
  outletId: string;
  outletName: string;
  salesCount: number;
  revenueCents: number;
}

export interface OutletRevenueDto {
  outletId: string;
  outletName: string;
  revenueCents: number;
  transactionCount: number;
}

export interface OutletTransactionCountDto {
  outletId: string;
  outletName: string;
  transactionCount: number;
}

export interface TopSellingItemDto {
  outletId: string;
  outletName: string;
  rank: number;
  menuItemSku: string;
  menuItemName: string;
  quantitySold: number;
  revenueCents: number;
}

export interface LowStockItemDto {
  outletMenuItemId: string;
  outletId: string;
  outletName: string;
  sku: string;
  name: string;
  quantity: number;
  lowStockThreshold: number;
}

export interface HqDashboardDto {
  totalOutlets: number;
  activeOutlets: number;
  activeMenuItems: number;
  lowStockItemCount: number;
  todaySalesCount: number;
  todayRevenueCents: number;
  latestSales: SaleDto[];
}

export interface OutletDashboardDto {
  outletId: string;
  outletName: string;
  todaySalesCount: number;
  todayRevenueCents: number;
  lowStockItemCount: number;
  latestSales: SaleDto[];
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface PaginationQuery {
  page: number;
  limit: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
