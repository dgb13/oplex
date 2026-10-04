import { api } from '@/lib/api';

/** Importador de artículos (ver ArticleImportService en el backend). */

export type ImportField =
  | 'sku'
  | 'name'
  | 'price'
  | 'cost'
  | 'category'
  | 'brand'
  | 'tax'
  | 'stock'
  | 'supplier'
  | 'unit'
  | 'description'
  | 'color'
  | 'size';
export type ImportFieldOrSkip = ImportField | 'skip';
export type UnitValue = 'UNIT' | 'KG' | 'LTR' | 'MM' | 'M2';

export const IMPORT_FIELD_OPTIONS: { value: ImportFieldOrSkip; label: string }[] = [
  { value: 'sku', label: 'Código (SKU) *' },
  { value: 'name', label: 'Nombre *' },
  { value: 'price', label: 'Precio de venta *' },
  { value: 'cost', label: 'Costo' },
  { value: 'category', label: 'Categoría' },
  { value: 'brand', label: 'Marca' },
  { value: 'tax', label: 'IVA' },
  { value: 'stock', label: 'Stock inicial' },
  { value: 'supplier', label: 'Proveedor' },
  { value: 'unit', label: 'Unidad de medida' },
  { value: 'description', label: 'Descripción larga' },
  { value: 'color', label: 'Color' },
  { value: 'size', label: 'Talle' },
  { value: 'skip', label: 'No importar' },
];

export const UNIT_OPTIONS: { value: UnitValue; label: string }[] = [
  { value: 'UNIT', label: 'Unidad' },
  { value: 'KG', label: 'Kilogramo' },
  { value: 'LTR', label: 'Litro' },
  { value: 'MM', label: 'Milímetro' },
  { value: 'M2', label: 'Metro cuadrado' },
];

export interface ImportColumn {
  index: number;
  header: string;
  samples: string[];
  suggested: ImportFieldOrSkip;
}

export interface ImportAnalysis {
  importId: string;
  fileName: string;
  headerRow: number;
  rowCount: number;
  columns: ImportColumn[];
}

export interface ImportOptions {
  mapping: ImportFieldOrSkip[];
  onExisting: 'update' | 'skip';
  pricesIncludeVat: boolean;
  warehouseId?: string;
  taxValues?: Record<string, string>;
  unitValues?: Record<string, UnitValue>;
}

export type RowStatus = 'new' | 'update' | 'skip' | 'error';

export interface PlanRow {
  rowNumber: number;
  status: RowStatus;
  messages: string[];
  sku: string;
  name: string;
  category: string | null;
  price: number | null;
  oldPrice: number | null;
  stock: number | null;
}

export interface ValueChoice {
  raw: string;
  count: number;
  resolved: string | null;
  resolvedLabel: string | null;
}

export interface ImportPreview {
  counts: Record<RowStatus, number>;
  rows: PlanRow[];
  taxValues: ValueChoice[];
  unitValues: ValueChoice[];
  taxOptions: { id: string; label: string }[];
  newCategories: string[];
  newSuppliers: string[];
  existingSuppliers: number;
  missingRequired: string[];
}

export interface ImportJobStatus {
  importId: string;
  state: 'running' | 'done' | 'failed';
  total: number;
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  newCategories: number;
  newSuppliers: number;
  error: string | null;
}

function saveBlob(data: Blob, fileName: string) {
  const url = window.URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export const articleImportApi = {
  analyze: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<ImportAnalysis>('/inventory/articles/import', form).then((r) => r.data);
  },
  preview: (importId: string, options: ImportOptions) =>
    api.post<ImportPreview>(`/inventory/articles/import/${importId}/preview`, options).then((r) => r.data),
  start: (importId: string, options: ImportOptions) =>
    api.post<ImportJobStatus>(`/inventory/articles/import/${importId}/start`, options).then((r) => r.data),
  status: (importId: string) =>
    api.get<ImportJobStatus>(`/inventory/articles/import/${importId}/status`).then((r) => r.data),
  downloadErrors: async (importId: string, options: ImportOptions) => {
    const res = await api.post(`/inventory/articles/import/${importId}/errors`, options, { responseType: 'blob' });
    saveBlob(res.data, 'articulos-con-error.xlsx');
  },
  downloadTemplate: async () => {
    const res = await api.get('/inventory/articles/import/template', { responseType: 'blob' });
    saveBlob(res.data, 'plantilla-articulos.xlsx');
  },
  exportArticles: async () => {
    const res = await api.get('/inventory/articles/export', { responseType: 'blob' });
    saveBlob(res.data, 'articulos.xlsx');
  },
};
