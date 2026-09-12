import { api } from '@/lib/api';

export interface WhatsAppLinkStatus {
  linked: boolean;
  phoneE164: string | null;
  verifiedAt: string | null;
  pending: { phoneE164: string; expiresAt: string; businessPhoneDisplay: string | null } | null;
}

export interface WhatsAppLinkRequestResult {
  phoneE164: string;
  code: string;
  expiresAt: string;
  businessPhoneDisplay: string | null;
}

// Fase 5a del asistente de IA (docs/plan-asistente-ia-conversacional.md,
// sección 3.3) - todavía sin recepción real de WhatsApp (Fase 5b), esto
// sólo pide/muestra el código y consulta el estado del link.
export const whatsAppLinkApi = {
  getStatus: () => api.get<WhatsAppLinkStatus>('/whatsapp-link/status').then((r) => r.data),
  requestLink: (phone: string) => api.post<WhatsAppLinkRequestResult>('/whatsapp-link/request', { phone }).then((r) => r.data),
  unlink: () => api.delete('/whatsapp-link').then((r) => r.data),
};
