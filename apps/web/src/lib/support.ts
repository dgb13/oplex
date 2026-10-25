import { api } from '@/lib/api';

// "Ayuda y soporte" del usuario. La bandeja del admin está en lib/admin.ts.
export type SupportTicketType = 'ERROR' | 'QUESTION' | 'SUGGESTION';
export type SupportTicketStatus = 'NEW' | 'IN_PROGRESS' | 'WAITING_USER' | 'RESOLVED';

export interface SupportTicketRow {
  id: string;
  number: number;
  type: SupportTicketType;
  module: string;
  subject: string;
  status: SupportTicketStatus;
  unreadByUser: boolean;
  lastMessageAt: string;
  createdAt: string;
}

export interface SupportTicketDetail extends SupportTicketRow {
  messages: Array<{
    id: string;
    authorKind: 'USER' | 'ADMIN';
    body: string;
    createdAt: string;
    attachments: Array<{ id: string; fileName: string; mimeType: string; sizeBytes: number }>;
  }>;
}

export interface NewSupportTicket {
  type: SupportTicketType;
  module: string;
  subject: string;
  body: string;
  context: Record<string, string> | null;
  files: File[];
}

export const SUPPORT_MODULES = [
  'Ventas y facturación',
  'Caja',
  'Inventario',
  'Compras',
  'Clientes y proveedores',
  'Tesorería',
  'Contabilidad e impuestos',
  'Producción',
  'ARCA',
  'Mercado Pago',
  'Tienda online',
  'Asistente de IA / WhatsApp',
  'Mi cuenta y plan',
  'Otra',
] as const;

export const MAX_SUPPORT_FILES = 5;
export const MAX_SUPPORT_FILE_BYTES = 5 * 1024 * 1024;

export function ticketCode(n: number): string {
  return `#${String(n).padStart(4, '0')}`;
}

export const supportApi = {
  list: () => api.get<SupportTicketRow[]>('/support/tickets').then((r) => r.data),
  unread: () => api.get<{ unread: number }>('/support/unread').then((r) => r.data),
  get: (id: string) => api.get<SupportTicketDetail>(`/support/tickets/${id}`).then((r) => r.data),
  create: (input: NewSupportTicket) => {
    const form = new FormData();
    form.append('type', input.type);
    form.append('module', input.module);
    form.append('subject', input.subject);
    form.append('body', input.body);
    if (input.context) form.append('context', JSON.stringify(input.context));
    input.files.forEach((f) => form.append('files', f));
    return api.post<{ id: string; number: number }>('/support/tickets', form).then((r) => r.data);
  },
  reply: (id: string, body: string, files: File[]) => {
    const form = new FormData();
    form.append('body', body);
    files.forEach((f) => form.append('files', f));
    return api.post(`/support/tickets/${id}/messages`, form).then((r) => r.data);
  },
  attachmentBlob: (id: string) =>
    api.get<Blob>(`/support/attachments/${id}`, { responseType: 'blob' }).then((r) => r.data),
};
