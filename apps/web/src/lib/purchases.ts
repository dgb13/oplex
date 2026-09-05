import { api } from '@/lib/api';
import type { DocumentLetter } from '@/lib/documentLetter';
import type { ArgentineJurisdiction, WithholdingTaxType } from '@/lib/taxes';

export type PurchaseDocumentStatus = 'DRAFT' | 'CONVERTED' | 'SENT' | 'CANCELLED';
export type PurchaseSendChannel = 'EMAIL' | 'WHATSAPP';
export type PdfStyle = 'MODERNO' | 'COMPACTO' | 'TRADICIONAL' | 'NATURAL' | 'LETRAS_GRANDES';

export const PDF_STYLES: { value: PdfStyle; label: string; description: string }[] = [
  { value: 'MODERNO', label: 'Moderno', description: 'Colores, encabezado destacado, look actual' },
  { value: 'COMPACTO', label: 'Compacto', description: 'Denso, ahorra espacio en pedidos largos' },
  { value: 'TRADICIONAL', label: 'Tradicional', description: 'Blanco y negro, formal, con firmas' },
  { value: 'NATURAL', label: 'Natural', description: 'Tonos cálidos, look amigable' },
  { value: 'LETRAS_GRANDES', label: 'Letras grandes', description: 'Máxima legibilidad, tipografía grande' },
];

export type CatalogRouteType = 'transport-modes' | 'payment-terms' | 'delivery-times';

export interface CatalogItem {
  id: string;
  name: string;
  active: boolean;
}

export interface CatalogRef {
  id: string;
  name: string;
}

export interface SupplierRef {
  id: string;
  name: string;
  taxId: string | null;
  email: string | null;
  fiscalAddress: string | null;
}

interface ArticleVariantRef {
  sku: string;
  color: string | null;
  size: string | null;
  brand: string | null;
  attributes: Record<string, string> | null;
  article: { name: string };
}

interface LineDetail {
  id: string;
  quantity: string;
  notes: string | null;
  articleVariant: ArticleVariantRef;
}

export interface QuoteRequestLineDetail extends LineDetail {
  estimatedUnitCost: string | null;
}

export interface PurchaseOrderLineDetail extends LineDetail {
  unitCost: string;
  // Derived (never stored) - sum of GoodsReceiptLine.quantity logged
  // against this line so far, and what's still left to receive. See
  // PurchaseOrderService.attachReceivingInfo on the backend.
  receivedQuantity: string;
  pendingQuantity: string;
}

export interface GoodsReceiptLineDetail {
  id: string;
  quantity: string;
  purchaseOrderLine: { id: string; articleVariantId: string; unitCost: string };
}

export interface SupplierReturnLineDetail {
  id: string;
  quantity: string;
  goodsReceiptLineId: string;
}

export interface SupplierReturnDetail {
  id: string;
  reason: string;
  notes: string | null;
  createdAt: string;
  returnedBy: { id: string; name: string | null; email: string };
  lines: SupplierReturnLineDetail[];
}

export interface GoodsReceiptDetail {
  id: string;
  supplierDocNumber: string | null;
  attachmentUrl: string | null;
  receivedAt: string;
  notes: string | null;
  receivedBy: { id: string; name: string | null; email: string };
  lines: GoodsReceiptLineDetail[];
  returns: SupplierReturnDetail[];
}

export interface QuoteRequestLineInput {
  articleVariantId: string;
  quantity: number;
  estimatedUnitCost?: number;
  notes?: string;
}

export interface PurchaseOrderLineInput {
  articleVariantId: string;
  quantity: number;
  unitCost: number;
  notes?: string;
}

export interface LinkedPurchaseOrderRef {
  id: string;
  number: string;
  status: PurchaseDocumentStatus;
  sentAt: string | null;
  sentVia: PurchaseSendChannel | null;
  sentToContactAvatarUrl: string | null;
}

export interface QuoteRequestSummary {
  id: string;
  number: string;
  status: PurchaseDocumentStatus;
  estimatedTotal: string | null;
  createdAt: string;
  supplier: { id: string; name: string };
  currency: { code: string };
  purchaseOrders: LinkedPurchaseOrderRef[];
  rfqGroupId: string | null;
}

export interface QuoteRequestDetail {
  id: string;
  number: string;
  status: PurchaseDocumentStatus;
  estimatedTotal: string | null;
  notes: string | null;
  validUntil: string | null;
  createdAt: string;
  supplier: SupplierRef;
  currency: { id: string; code: string; name: string };
  transportMode: CatalogRef | null;
  paymentTerm: CatalogRef | null;
  deliveryTime: CatalogRef | null;
  lines: QuoteRequestLineDetail[];
  purchaseOrders: LinkedPurchaseOrderRef[];
  rfqGroupId: string | null;
}

export interface CreateQuoteRequestGroupInput {
  supplierIds: string[];
  currencyId: string;
  transportModeId?: string;
  paymentTermId?: string;
  deliveryTimeId?: string;
  validUntil?: string;
  notes?: string;
  lines: QuoteRequestLineInput[];
}

export interface QuoteRequestGroupCreateResult {
  rfqGroupId: string;
  quoteRequests: QuoteRequestDetail[];
}

export interface QuoteRequestComparisonQuote {
  quoteRequestId: string;
  quantity: string | null;
  unitCost: string | null;
  lineTotal: string | null;
}

export interface QuoteRequestComparisonRow {
  articleVariantId: string;
  articleVariant: ArticleVariantRef;
  quotes: QuoteRequestComparisonQuote[];
}

export interface QuoteRequestComparisonSupplier {
  quoteRequestId: string;
  number: string;
  supplier: { id: string; name: string };
  status: PurchaseDocumentStatus;
  estimatedTotal: string | null;
}

export interface QuoteRequestComparison {
  rfqGroupId: string;
  suppliers: QuoteRequestComparisonSupplier[];
  rows: QuoteRequestComparisonRow[];
}

/** DRAFT/CANCELLED map straight to their own label. CONVERTED splits in
 * two depending on the resulting Orden de Compra: "Comprado" once issued
 * but only saved, "Enviado" once that order was actually sent to the
 * supplier (email/WhatsApp) - the Pedido's own `status` enum has no SENT
 * value of its own, this derives it from the linked order instead of
 * duplicating sentAt/sentVia onto QuoteRequest. */
export function describeQuoteRequestStatus(qr: {
  status: PurchaseDocumentStatus;
  purchaseOrders: LinkedPurchaseOrderRef[];
}): { label: string; colorClass: string; purchaseOrder: LinkedPurchaseOrderRef | null } {
  if (qr.status === 'DRAFT') {
    return { label: 'Borrador', colorClass: STATUS_COLOR_CLASSES.DRAFT, purchaseOrder: null };
  }
  if (qr.status === 'CANCELLED') {
    return { label: 'Cancelado', colorClass: STATUS_COLOR_CLASSES.CANCELLED, purchaseOrder: null };
  }
  const purchaseOrder = qr.purchaseOrders[0] ?? null;
  return purchaseOrder?.sentAt
    ? { label: 'Enviado', colorClass: STATUS_COLOR_CLASSES.ENVIADO, purchaseOrder }
    : { label: 'Comprado', colorClass: STATUS_COLOR_CLASSES.COMPRADO, purchaseOrder };
}

const STATUS_COLOR_CLASSES = {
  DRAFT: 'bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-300',
  CANCELLED: 'bg-slate-200 dark:bg-slate-800 text-slate-500',
  COMPRADO: 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300',
  ENVIADO: 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300',
} as const;

export interface PurchaseOrderSummary {
  id: string;
  number: string;
  status: PurchaseDocumentStatus;
  total: string;
  sentAt: string | null;
  sentVia: PurchaseSendChannel | null;
  // Snapshot of who the last send actually went to - null on orders sent
  // before this field existed, or never sent. See schema.prisma comment
  // on PurchaseOrder for why this isn't just re-derived from the
  // supplier's current email/contacts.
  sentToEmail: string | null;
  sentToPhone: string | null;
  sentToContactName: string | null;
  sentToContactAvatarUrl: string | null;
  createdAt: string;
  supplier: { id: string; name: string; email: string | null };
  currency: { code: string };
  lines: { id: string; quantity: string; receivedQuantity: string; pendingQuantity: string }[];
}

/** "Recibida total"/"Recibida parcial"/null (nothing received yet) -
 * derived client-side from the same lines the table already has, same
 * criterion as describeQuoteRequestStatus above (no backend enum for
 * this - see GoodsReceipt's schema comment on why it's always derived). */
export function describeReceiptStatus(
  order: Pick<PurchaseOrderSummary, 'status' | 'lines'>,
): { label: string; colorClass: string; percent: number } | null {
  if (order.status !== 'SENT') {
    return null;
  }
  const totalOrdered = order.lines.reduce((sum, l) => sum + Number(l.quantity), 0);
  const totalPending = order.lines.reduce((sum, l) => sum + Number(l.pendingQuantity), 0);
  const totalReceived = order.lines.reduce((sum, l) => sum + Number(l.receivedQuantity), 0);
  if (totalReceived === 0) {
    return null;
  }
  if (totalPending <= 0) {
    return { label: 'Recibida total', colorClass: STATUS_COLOR_CLASSES.COMPRADO, percent: 100 };
  }
  const percent = totalOrdered > 0 ? Math.min(100, Math.round((totalReceived / totalOrdered) * 100)) : 0;
  return { label: `Recibida parcial · ${percent}%`, colorClass: STATUS_COLOR_CLASSES.ENVIADO, percent };
}

export interface PurchaseOrderDetail {
  id: string;
  number: string;
  status: PurchaseDocumentStatus;
  total: string;
  notes: string | null;
  sentAt: string | null;
  sentVia: PurchaseSendChannel | null;
  sentToEmail: string | null;
  sentToPhone: string | null;
  sentToContactName: string | null;
  sentToContactAvatarUrl: string | null;
  createdAt: string;
  supplier: SupplierRef;
  currency: { id: string; code: string; name: string };
  transportMode: CatalogRef | null;
  paymentTerm: CatalogRef | null;
  deliveryTime: CatalogRef | null;
  quoteRequest: { id: string; number: string } | null;
  lines: PurchaseOrderLineDetail[];
  receipts: GoodsReceiptDetail[];
}

export interface PurchasePreferences {
  quoteRequestPrefix: string;
  quoteRequestNextNumber: number;
  purchaseOrderPrefix: string;
  purchaseOrderNextNumber: number;
  purchaseDocumentPdfStyle: PdfStyle;
}

export interface CreateQuoteRequestInput {
  supplierId: string;
  currencyId: string;
  transportModeId?: string;
  paymentTermId?: string;
  deliveryTimeId?: string;
  validUntil?: string;
  notes?: string;
  lines: QuoteRequestLineInput[];
}

export interface CreatePurchaseOrderInput {
  supplierId: string;
  currencyId: string;
  transportModeId?: string;
  paymentTermId?: string;
  deliveryTimeId?: string;
  notes?: string;
  lines: PurchaseOrderLineInput[];
}

export interface GoodsReceiptLineInput {
  purchaseOrderLineId: string;
  quantity: number;
}

export interface CreateGoodsReceiptInput {
  purchaseOrderId: string;
  warehouseId: string;
  supplierDocNumber?: string;
  receivedAt?: string;
  notes?: string;
  lines: GoodsReceiptLineInput[];
}

export interface SupplierReturnLineInput {
  goodsReceiptLineId: string;
  quantity: number;
}

export interface CreateSupplierReturnInput {
  goodsReceiptId: string;
  reason: string;
  notes?: string;
  lines: SupplierReturnLineInput[];
}

/** GET .../pdf needs the Authorization header, so a plain <a href> or
 * window.open(url) won't work (no way to attach a header to a bare
 * navigation) - fetch as a blob through axios (which does attach it via
 * the request interceptor) and open that instead. Same reasoning as
 * inventoryApi.downloadImportTemplate, but opened inline (window.open)
 * instead of force-downloaded, so the user can look at it before deciding
 * to save/print/send. */
async function openPdf(path: string, style?: PdfStyle): Promise<void> {
  const res = await api.get(path, {
    params: style ? { style } : {},
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
  window.open(url, '_blank');
}

export const catalogsApi = {
  list: (type: CatalogRouteType, includeInactive?: boolean) =>
    api
      .get<CatalogItem[]>(`/purchases/catalogs/${type}`, {
        params: includeInactive ? { includeInactive: 'true' } : {},
      })
      .then((r) => r.data),
  create: (type: CatalogRouteType, name: string) =>
    api.post<CatalogItem>(`/purchases/catalogs/${type}`, { name }).then((r) => r.data),
  update: (type: CatalogRouteType, id: string, dto: { name?: string; active?: boolean }) =>
    api.patch<CatalogItem>(`/purchases/catalogs/${type}/${id}`, dto).then((r) => r.data),
};

export const purchasePreferencesApi = {
  get: () => api.get<PurchasePreferences>('/purchases/preferences').then((r) => r.data),
  update: (
    dto: Partial<{
      quoteRequestPrefix: string;
      purchaseOrderPrefix: string;
      purchaseDocumentPdfStyle: PdfStyle;
    }>,
  ) => api.patch<PurchasePreferences>('/purchases/preferences', dto).then((r) => r.data),
};

export const quoteRequestsApi = {
  list: (status?: PurchaseDocumentStatus, supplierId?: string) =>
    api
      .get<QuoteRequestSummary[]>('/purchases/quote-requests', { params: { status, supplierId } })
      .then((r) => r.data),
  get: (id: string) => api.get<QuoteRequestDetail>(`/purchases/quote-requests/${id}`).then((r) => r.data),
  create: (dto: CreateQuoteRequestInput) =>
    api.post<QuoteRequestDetail>('/purchases/quote-requests', dto).then((r) => r.data),
  update: (id: string, dto: Partial<CreateQuoteRequestInput>) =>
    api.patch<QuoteRequestDetail>(`/purchases/quote-requests/${id}`, dto).then((r) => r.data),
  clone: (id: string) =>
    api.post<QuoteRequestDetail>(`/purchases/quote-requests/${id}/clone`).then((r) => r.data),
  convert: (id: string) =>
    api.post<PurchaseOrderDetail>(`/purchases/quote-requests/${id}/convert`).then((r) => r.data),
  cancel: (id: string) => api.patch(`/purchases/quote-requests/${id}/cancel`).then(() => undefined),
  openPdf: (id: string, style?: PdfStyle) => openPdf(`/purchases/quote-requests/${id}/pdf`, style),
  createGroup: (dto: CreateQuoteRequestGroupInput) =>
    api.post<QuoteRequestGroupCreateResult>('/purchases/quote-requests/groups', dto).then((r) => r.data),
  compareGroup: (rfqGroupId: string) =>
    api
      .get<QuoteRequestComparison>(`/purchases/quote-requests/groups/${rfqGroupId}/compare`)
      .then((r) => r.data),
  selectWinner: (rfqGroupId: string, winningQuoteRequestId: string) =>
    api
      .post<PurchaseOrderDetail>(`/purchases/quote-requests/groups/${rfqGroupId}/select-winner`, {
        winningQuoteRequestId,
      })
      .then((r) => r.data),
};

export const purchaseOrdersApi = {
  list: (status?: PurchaseDocumentStatus, supplierId?: string) =>
    api
      .get<PurchaseOrderSummary[]>('/purchases/purchase-orders', { params: { status, supplierId } })
      .then((r) => r.data),
  get: (id: string) => api.get<PurchaseOrderDetail>(`/purchases/purchase-orders/${id}`).then((r) => r.data),
  create: (dto: CreatePurchaseOrderInput) =>
    api.post<PurchaseOrderDetail>('/purchases/purchase-orders', dto).then((r) => r.data),
  update: (id: string, dto: Partial<CreatePurchaseOrderInput>) =>
    api.patch<PurchaseOrderDetail>(`/purchases/purchase-orders/${id}`, dto).then((r) => r.data),
  cancel: (id: string) => api.patch(`/purchases/purchase-orders/${id}/cancel`).then(() => undefined),
  sendEmail: (id: string) =>
    api.post<PurchaseOrderDetail>(`/purchases/purchase-orders/${id}/send-email`).then((r) => r.data),
  sendFollowUpEmail: (id: string, dto: { to: string; subject?: string; text: string }) =>
    api.post<void>(`/purchases/purchase-orders/${id}/follow-up-email`, dto).then(() => undefined),
  whatsappLink: (id: string, phone: string) =>
    api
      .get<{ url: string }>(`/purchases/purchase-orders/${id}/whatsapp-link`, { params: { phone } })
      .then((r) => r.data),
  markSentWhatsapp: (id: string, phone: string, contactName?: string, contactAvatarUrl?: string) =>
    api
      .post<PurchaseOrderDetail>(`/purchases/purchase-orders/${id}/mark-sent-whatsapp`, {
        phone,
        contactName,
        contactAvatarUrl,
      })
      .then((r) => r.data),
  openPdf: (id: string, style?: PdfStyle) => openPdf(`/purchases/purchase-orders/${id}/pdf`, style),
};

export const goodsReceiptsApi = {
  create: (dto: CreateGoodsReceiptInput) =>
    api.post<GoodsReceiptDetail>('/purchases/goods-receipts', dto).then((r) => r.data),
  uploadAttachment: (receiptId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api
      .post<GoodsReceiptDetail>(`/purchases/goods-receipts/${receiptId}/attachment`, formData)
      .then((r) => r.data);
  },
};

export const supplierReturnsApi = {
  create: (dto: CreateSupplierReturnInput) =>
    api.post<SupplierReturnDetail>('/purchases/supplier-returns', dto).then((r) => r.data),
};

// --- Cuentas a Pagar: Factura de Compra ---

export type PurchaseInvoiceStatus = 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED';
export type PurchaseInvoiceTaxLineType = 'IVA_CREDITO' | 'PERCEPCION';

const PURCHASE_INVOICE_STATUS_LABELS: Record<PurchaseInvoiceStatus, string> = {
  ISSUED: 'Emitida',
  PARTIALLY_PAID: 'Pago parcial',
  PAID: 'Pagada',
  CANCELLED: 'Cancelada',
};

const PURCHASE_INVOICE_STATUS_COLORS: Record<PurchaseInvoiceStatus, string> = {
  ISSUED: 'bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-300',
  PARTIALLY_PAID: 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300',
  PAID: 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300',
  CANCELLED: 'bg-slate-200 dark:bg-slate-800 text-slate-500',
};

export function describePurchaseInvoiceStatus(status: PurchaseInvoiceStatus): {
  label: string;
  colorClass: string;
} {
  return { label: PURCHASE_INVOICE_STATUS_LABELS[status], colorClass: PURCHASE_INVOICE_STATUS_COLORS[status] };
}

export interface PurchaseInvoiceTaxLineDetail {
  id: string;
  type: PurchaseInvoiceTaxLineType;
  concept: string;
  amount: string;
  // Sólo presentes en filas IVA_CREDITO cargadas con el desglose por
  // alícuota - null en filas PERCEPCION y en comprobantes viejos.
  netAmount: string | null;
  taxRate: string | null;
}

export interface PurchaseInvoiceTaxLineInput {
  type: PurchaseInvoiceTaxLineType;
  concept: string;
  amount: number;
  netAmount?: number;
  taxRate?: number;
  // Sub-clasificación de una fila PERCEPCION (IVA/IIBB/Ganancias) - sólo
  // para el export Libro de IVA Digital de Compras, ver CitiExportService.
  taxType?: WithholdingTaxType;
}

export interface SupplierPaymentWithholdingDetail {
  id: string;
  regimeId: string | null;
  taxType: WithholdingTaxType;
  jurisdiction: ArgentineJurisdiction | null;
  concept: string;
  amount: string;
  certificateNumber: string | null;
}

export interface SupplierPaymentWithholdingInput {
  regimeId?: string;
  taxType: WithholdingTaxType;
  jurisdiction?: ArgentineJurisdiction;
  concept: string;
  amount: number;
  certificateNumber?: string;
}

export interface SupplierPaymentDetail {
  id: string;
  amount: string;
  method: string;
  paidAt: string;
  withholdings: SupplierPaymentWithholdingDetail[];
}

export interface PurchaseInvoiceSummary {
  id: string;
  supplierInvoiceNumber: string;
  supplierInvoiceDate: string;
  dueDate: string | null;
  subtotal: string;
  taxTotal: string;
  total: string;
  balanceDue: string;
  status: PurchaseInvoiceStatus;
  supplierId: string;
  supplierName: string;
  createdAt: string;
  // Null = factura de compra directa, sin OC (ver "Carga de comprobantes IA").
  purchaseOrder: { id: string; number: string } | null;
  taxLines: PurchaseInvoiceTaxLineDetail[];
  // Ambos null = cargada a mano. Ambos no-null = vino de "Carga con IA" -
  // alimenta "Galería IA" (GaleriaIaTab). Ver PurchaseInvoice.aiScanConfidence
  // en el schema del backend.
  aiScanConfidence: string | null;
  aiScanEdited: boolean | null;
  // En el summary (no sólo el detalle) para poder mostrar la miniatura en
  // la grilla de "Galería IA" sin pedir el detalle completo de cada una.
  attachmentUrl: string | null;
}

export interface PurchaseInvoiceDetail extends PurchaseInvoiceSummary {
  notes: string | null;
  createdBy: { id: string; name: string | null; email: string };
  receiptLinks: { id: string; goodsReceipt: { id: string; supplierDocNumber: string | null; receivedAt: string } }[];
  payments: SupplierPaymentDetail[];
}

export interface CreatePurchaseInvoiceInput {
  // Requeridos sólo cuando purchaseOrderId no viene (ver
  // CreatePurchaseInvoiceDto del backend) - factura de compra directa.
  purchaseOrderId?: string;
  supplierId?: string;
  currencyId?: string;
  supplierInvoiceNumber: string;
  supplierInvoiceDate: string;
  dueDate?: string;
  subtotal: number;
  goodsReceiptIds?: string[];
  taxLines?: PurchaseInvoiceTaxLineInput[];
  notes?: string;
  // Estructurados y opcionales, sólo para el export Libro de IVA Digital
  // (RG 4597) - no reemplazan supplierInvoiceNumber.
  documentLetter?: DocumentLetter;
  pointOfSale?: string;
  number?: string;
  // Ver PurchaseInvoiceSummary.aiScanConfidence/aiScanEdited - los manda
  // CargaIaTab al confirmar, nunca NewPurchaseInvoiceModal (carga manual).
  aiScanConfidence?: number;
  aiScanEdited?: boolean;
}

export interface ListPurchaseInvoicesFilters {
  aiScannedOnly?: boolean;
  supplierId?: string;
  dateFrom?: string;
  dateTo?: string;
  confidenceLevel?: 'alta' | 'media' | 'baja';
  edited?: boolean;
}

export interface OwnCheckInput {
  number: string;
  bankName: string;
  format?: 'PHYSICAL' | 'ECHEQ';
  issueDate: string;
  dueDate: string;
  financialAccountId?: string;
}

export interface RecordSupplierPaymentInput {
  amount: number;
  method: string;
  financialAccountId?: string;
  paidAt?: string;
  withholdings?: SupplierPaymentWithholdingInput[];
  // A lo sumo uno de los dos - ver TreasuryController en el backend.
  endorseCheckId?: string;
  ownCheck?: OwnCheckInput;
}

export const purchaseInvoicesApi = {
  list: (filters?: ListPurchaseInvoicesFilters) =>
    api
      .get<PurchaseInvoiceSummary[]>('/purchases/purchase-invoices', { params: filters })
      .then((r) => r.data),
  get: (id: string) => api.get<PurchaseInvoiceDetail>(`/purchases/purchase-invoices/${id}`).then((r) => r.data),
  create: (dto: CreatePurchaseInvoiceInput) =>
    api.post<PurchaseInvoiceDetail>('/purchases/purchase-invoices', dto).then((r) => r.data),
  recordPayment: (id: string, dto: RecordSupplierPaymentInput) =>
    api.post<SupplierPaymentDetail>(`/purchases/purchase-invoices/${id}/payments`, dto).then((r) => r.data),
  uploadAttachment: (id: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api
      .post<PurchaseInvoiceDetail>(`/purchases/purchase-invoices/${id}/attachment`, formData)
      .then((r) => r.data);
  },
};
