import { api } from '@/lib/api';

export type ProductionStatus = 'DRAFT' | 'PLANNED' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
export type ReservationStatus = 'ACTIVE' | 'CONSUMED' | 'RELEASED';
export type PieceStatus = 'AVAILABLE' | 'DEPLETED' | 'SCRAP';
export type PieceSource = 'FULL_STOCK' | 'OFFCUT';

// Todos los campos Decimal de Prisma (quantity/cost/length/etc.) llegan
// como string en el JSON (Prisma.Decimal#toJSON) - a diferencia de
// inventory.ts, estos endpoints devuelven el modelo crudo sin mapear, así
// que acá se tipan tal cual llegan y se convierten con Number() donde haga
// falta operar/mostrar.
export interface BomLine {
  id: string;
  bomId: string;
  inputArticleVariantId: string;
  quantity: string;
  width: string | null;
  length: string | null;
  cutsCount: number | null;
  expectedWastePercent: string;
}

export interface BomByproduct {
  id: string;
  bomId: string;
  outputArticleVariantId: string;
  quantity: string;
  costSharePercent: string | null;
}

export interface BomSummary {
  id: string;
  outputArticleVariantId: string;
  name: string;
  version: number;
  isActive: boolean;
  createdAt: string;
}

// BomService.listVersions (a diferencia de create/getActiveBomOrThrow) NO
// trae lines/byproducts - es sólo el historial de versiones, ver el
// service. Tipado aparte para no prometer campos que no llegan.
export interface Bom extends BomSummary {
  lines: BomLine[];
  byproducts: BomByproduct[];
}

export interface CreateBomLineInput {
  inputArticleVariantId: string;
  quantity: number;
  width?: number;
  length?: number;
  cutsCount?: number;
  expectedWastePercent?: number;
}

export interface CreateBomByproductInput {
  outputArticleVariantId: string;
  quantity: number;
  costSharePercent?: number;
}

export interface CreateBomInput {
  outputArticleVariantId: string;
  name: string;
  lines: CreateBomLineInput[];
  byproducts?: CreateBomByproductInput[];
}

export interface ProducibleLine {
  line: BomLine;
  disponible: string;
  requerido: string;
  producible: string;
}

export interface ProducibleResult {
  maxProducible: string;
  bottleneck: BomLine | null;
  perLine: ProducibleLine[];
}

export interface ProductionOrder {
  id: string;
  outputArticleVariantId: string;
  bomId: string | null;
  bomVersion: number | null;
  quantity: string;
  status: ProductionStatus;
  isShortOnMaterials: boolean;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  cancelledAt: string | null;
}

export interface StockReservation {
  id: string;
  productionOrderId: string;
  inputArticleVariantId: string;
  warehouseId: string;
  quantityReserved: string;
  status: ReservationStatus;
}

export interface ProductionConsumption {
  id: string;
  productionOrderId: string;
  inputArticleVariantId: string;
  stockPieceId: string | null;
  quantityConsumed: string;
  offcutPieceId: string | null;
  wasteAmount: string;
  cost: string;
}

export interface ProductionOutput {
  id: string;
  productionOrderId: string;
  articleVariantId: string;
  isPrimary: boolean;
  quantityProduced: string;
  cost: string;
}

export interface ProductionOrderDetail extends ProductionOrder {
  reservations: StockReservation[];
  consumptions: ProductionConsumption[];
  outputs: ProductionOutput[];
}

export interface StockPiece {
  id: string;
  articleVariantId: string;
  warehouseId: string;
  originalLength: string;
  currentLength: string;
  status: PieceStatus;
  sourceType: PieceSource;
  parentPieceId: string | null;
  unitCost: string;
  createdAt: string;
}

export type BomAttachmentType = 'PDF' | 'ZIP';

// Documentación (plano, hoja de corte) de una versión PUNTUAL de receta
// (bomId, no el articleVariantId) - decisión ya confirmada con el
// usuario: guardar como versión nueva no arrastra los adjuntos viejos.
export interface BomAttachment {
  id: string;
  bomId: string;
  fileType: BomAttachmentType;
  fileName: string;
  fileUrl: string;
  fileSizeBytes: number;
  uploadedByUserId: string;
  createdAt: string;
}

export const productionApi = {
  getBom: (articleVariantId: string) => api.get<Bom>(`/production/bom/${articleVariantId}`).then((r) => r.data),
  listBomVersions: (articleVariantId: string) =>
    api.get<BomSummary[]>(`/production/bom/${articleVariantId}/versions`).then((r) => r.data),
  createBom: (dto: CreateBomInput) => api.post<Bom>('/production/bom', dto).then((r) => r.data),
  computeProducible: (articleVariantId: string, warehouseId: string) =>
    api
      .get<ProducibleResult>('/production/producible', { params: { articleVariantId, warehouseId } })
      .then((r) => r.data),
  // Sin filtro server-side por status (el controller no lo expone hoy,
  // mismo criterio que el reporte de Admin "preguntas sin responder" -
  // volumen bajo, se filtra en el cliente) - las pantallas que necesitan
  // sólo PLANNED/DONE/etc. filtran el array acá.
  listOrders: () => api.get<ProductionOrder[]>('/production/orders').then((r) => r.data),
  getOrder: (id: string) => api.get<ProductionOrderDetail>(`/production/orders/${id}`).then((r) => r.data),
  createOrder: (dto: { outputArticleVariantId: string; quantity: number }) =>
    api.post<ProductionOrder>('/production/orders', dto).then((r) => r.data),
  confirmOrder: (id: string, warehouseId: string) =>
    api.post<ProductionOrder>(`/production/orders/${id}/confirm`, { warehouseId }).then((r) => r.data),
  cancelOrder: (id: string) => api.post<ProductionOrder>(`/production/orders/${id}/cancel`).then((r) => r.data),
  completeOrder: (id: string) => api.post<ProductionOrder>(`/production/orders/${id}/complete`).then((r) => r.data),
  listPieces: (articleVariantId: string, warehouseId?: string) =>
    api
      .get<StockPiece[]>('/production/pieces', { params: { articleVariantId, warehouseId } })
      .then((r) => r.data),
  listBomAttachments: (bomId: string) =>
    api.get<BomAttachment[]>(`/production/bom/attachments/${bomId}`).then((r) => r.data),
  uploadBomAttachment: (bomId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api
      .post<BomAttachment>(`/production/bom/attachments/${bomId}`, formData)
      .then((r) => r.data);
  },
  deleteBomAttachment: (attachmentId: string) =>
    api.delete(`/production/bom/attachments/${attachmentId}`).then((r) => r.data),
};
