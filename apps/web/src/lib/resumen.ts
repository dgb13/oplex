import { api } from '@/lib/api';
import type { DateRange } from '@/lib/reports';

export interface MonthlyRevenue {
  month: string; // 'YYYY-MM'
  invoiceCount: number;
  subtotal: string;
  taxTotal: string;
  total: string;
}

export interface SellerSales {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  invoiceCount: number;
  totalSales: string;
}

export interface SupplierPurchases {
  supplierId: string;
  supplierName: string;
  orderCount: number;
  totalPurchased: string;
}

export interface BuyerPurchases {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  orderCount: number;
  totalPurchased: string;
}

export interface CategoryStockValue {
  categoryId: string | null;
  categoryName: string;
  totalValue: string;
}

/** Cliente de los endpoints nuevos armados para el módulo "Resumen"
 * (plan técnico aprobado en sesión, Fases 0-2) - los que ya existían de
 * antes (ventas por cliente/producto, antigüedad de cartera) siguen
 * viviendo en reportsApi/receivablesApi/payablesApi, no se duplican acá. */
export const resumenApi = {
  getRevenueByMonth: (range: DateRange) =>
    api.get<MonthlyRevenue[]>('/reports/sales/by-month', { params: range }).then((r) => r.data),
  getSalesBySeller: (range: DateRange) =>
    api.get<SellerSales[]>('/reports/sales/by-seller', { params: range }).then((r) => r.data),
  getPurchasesBySupplier: (range: DateRange) =>
    api.get<SupplierPurchases[]>('/reports/purchases/by-supplier', { params: range }).then((r) => r.data),
  getPurchasesByBuyer: (range: DateRange) =>
    api.get<BuyerPurchases[]>('/reports/purchases/by-buyer', { params: range }).then((r) => r.data),
  getStockValueByCategory: () =>
    api.get<CategoryStockValue[]>('/inventory/stock-value-by-category').then((r) => r.data),
};
