import { api } from '@/lib/api';

/** Órdenes de trabajo. Espejo de apps/api/src/app/work-orders. */
export interface WorkOrderStatus {
  id: string;
  name: string;
  sortOrder: number;
  isFinal: boolean;
  notifiesCustomer: boolean;
  active: boolean;
}

export interface WorkOrderConfig {
  /** "Orden de trabajo", "Orden de servicio", "Pedido"... (del rubro). */
  docName: string;
  pluralName: string;
  statuses: WorkOrderStatus[];
}

export interface WorkOrder {
  id: string;
  number: string;
  description: string;
  intakeNotes: string | null;
  assetSnapshot: Record<string, string | number | boolean> | null;
  assignedUserId: string | null;
  promisedAt: string | null;
  quoteId: string | null;
  invoiceId: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  customer: { id: string; name: string; phone: string | null };
  asset: { id: string; identifier: string; typeId: string; typeName: string } | null;
  status: { id: string; name: string; isFinal: boolean; notifiesCustomer: boolean };
}

export interface WorkOrderDetail extends WorkOrder {
  assignedUserName: string | null;
  quote: { id: string; number: string; status: string; total: string } | null;
  invoice: { id: string; label: string; status: string; total: string } | null;
  history: { id: string; fromStatusId: string | null; toStatusId: string; userName: string | null; createdAt: string }[];
}

export interface CreateWorkOrderInput {
  customerId: string;
  assetId?: string;
  description: string;
  intakeNotes?: string;
  assetValues?: Record<string, string | number | boolean>;
  assignedUserId?: string;
  promisedAt?: string;
}

export const workOrdersApi = {
  config: () => api.get<WorkOrderConfig>('/work-orders/config').then((r) => r.data),
  updateConfig: (input: { docName?: string; statuses: Partial<WorkOrderStatus>[] }) =>
    api.put<WorkOrderConfig>('/work-orders/config', input).then((r) => r.data),
  assignees: () => api.get<{ id: string; name: string }[]>('/work-orders/assignees').then((r) => r.data),
  list: (params: { statusId?: string; assetId?: string; customerId?: string; q?: string; scope?: 'open' | 'closed' | 'all' } = {}) =>
    api
      .get<WorkOrder[]>('/work-orders', {
        params: Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== '')),
      })
      .then((r) => r.data),
  get: (id: string) => api.get<WorkOrderDetail>(`/work-orders/${id}`).then((r) => r.data),
  create: (input: CreateWorkOrderInput) => api.post<WorkOrderDetail>('/work-orders', input).then((r) => r.data),
  update: (
    id: string,
    input: Partial<{
      description: string;
      intakeNotes: string;
      assignedUserId: string | null;
      promisedAt: string | null;
      quoteId: string | null;
      invoiceId: string | null;
    }>,
  ) => api.patch<WorkOrderDetail>(`/work-orders/${id}`, input).then((r) => r.data),
  changeStatus: (id: string, statusId: string) =>
    api.post<WorkOrderDetail>(`/work-orders/${id}/status`, { statusId }).then((r) => r.data),
  whatsappLink: (id: string, phone?: string) =>
    api
      .get<{ url: string; message: string }>(`/work-orders/${id}/whatsapp-link`, { params: phone ? { phone } : {} })
      .then((r) => r.data),
};

/** Color de la pastilla de un estado: abierto, listo (avisa) o cerrado. */
export function statusTone(status: { isFinal: boolean; notifiesCustomer: boolean }): string {
  if (status.isFinal) return 'bg-muted text-muted-foreground';
  if (status.notifiesCustomer) return 'bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300';
  return 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300';
}

/** Una fecha sin hora (promisedAt se guarda a las 00:00 UTC): se muestra el
 * día tal cual, sin pasarlo a la hora local (que lo correría al día anterior). */
export function formatDay(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
