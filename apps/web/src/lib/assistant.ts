import { api, API_BASE_URL } from '@/lib/api';

export interface AssistantSettings {
  assistantDisplayName: string | null;
  /** false = la empresa lo apagó en Preferencias › Asistente (el widget se oculta). */
  webEnabled: boolean;
}

export const FALLBACK_ASSISTANT_NAME = 'Asistente Oplex';

export type AssistantMessageRole = 'USER' | 'ASSISTANT';
export type AssistantMessageFeedback = 'UP' | 'DOWN';

// Dato crudo que devolvió una herramienta durante ese turno (docs/planesdemodulos/plan-asistente-ia-conversacional.md,
// sección 5.3) - el widget lo usa para el mini-gráfico/tabla embebido en
// la burbuja de respuesta, ver AssistantChart.tsx.
export interface AssistantToolCall {
  tool: string;
  data: unknown;
}

export interface AssistantMessage {
  id: string;
  role: AssistantMessageRole;
  content: string;
  feedback: AssistantMessageFeedback | null;
  createdAt: string;
  toolCalls?: AssistantToolCall[] | null;
}

// Mismo shape que AiInvoiceScanUsage (apps/web/src/lib/ai-invoice-scan.ts) -
// quota:null significa que el plan actual no incluye el asistente.
export interface AssistantUsage {
  planName: string;
  quota: number | null;
  /** true = sin tope mensual (quota viene null pero el asistente está incluido). */
  unlimited: boolean;
  used: number;
}

// Widget de chat (docs/planesdemodulos/plan-asistente-ia-conversacional.md) - Fase 3 suma
// historial persistente (la conversación activa se carga al montar el
// widget, ver AssistantConversationService en el backend) y feedback
// 👍/👎 por respuesta.
export const assistantApi = {
  getSettings: () => api.get<AssistantSettings>('/assistant/settings').then((r) => r.data),
  getUsage: () => api.get<AssistantUsage>('/assistant/usage').then((r) => r.data),
  getConversation: () => api.get<{ messages: AssistantMessage[] }>('/assistant/conversation').then((r) => r.data),
  startNewConversation: () => api.post<{ messages: AssistantMessage[] }>('/assistant/conversation/new').then((r) => r.data),
  sendMessage: (message: string) =>
    api.post<{ reply: string; messageId: string }>('/assistant/message', { message }).then((r) => r.data),
  setFeedback: (messageId: string, feedback: AssistantMessageFeedback) =>
    api.patch(`/assistant/messages/${messageId}/feedback`, { feedback }).then((r) => r.data),
};

// Historial de Preferencias › Asistente (docs/planesdemodulos/plan-asistente-fase2-gestion-acciones.md,
// etapa 1) - sólo OWNER/ADMIN, cruza a todos los usuarios de la empresa.
export type AssistantChannel = 'WEB' | 'WHATSAPP';
export type AssistantHistoryStatus = 'ANSWERED_WITH_DATA' | 'ANSWERED_WITHOUT_DATA' | 'HELP' | 'NO_REPLY' | 'BLOCKED';

export interface AssistantHistoryEntry {
  id: string;
  createdAt: string;
  /** null = mensaje de antes de que se guardara el canal. */
  channel: AssistantChannel | null;
  user: { id: string; name: string; role: string | null };
  question: string;
  answer: string | null;
  status: AssistantHistoryStatus;
  /** Nombre del tema negado, sólo si status === 'BLOCKED'. */
  blockedTopic: string | null;
  tools: string[];
  feedback: AssistantMessageFeedback | null;
  action: {
    id: string;
    label: string;
    level: string;
    status: AssistantActionStatus;
    summary: string;
    errorMessage: string | null;
    undoable: boolean;
  } | null;
}

export interface AssistantHistoryPage {
  entries: AssistantHistoryEntry[];
  nextCursor: string | null;
}

export interface AssistantHistoryStats {
  questionsToday: number;
  whatsappToday: number;
  withoutDataToday: number;
  blockedToday: number;
  actionsDoneToday: number;
  actionsPendingNow: number;
}

export const assistantHistoryApi = {
  list: (params: { channel?: AssistantChannel; blocked?: boolean; actions?: boolean; before?: string }) =>
    api.get<AssistantHistoryPage>('/assistant/history', { params }).then((r) => r.data),
  stats: () => api.get<AssistantHistoryStats>('/assistant/history/stats').then((r) => r.data),
};

// "Temas por rol" (etapa 2): la matriz viene armada del servidor, con el
// motivo de cada celda que el rol no puede tener en Oplex.
export type AssistantConfigurableRole = 'SALES' | 'PURCHASES' | 'INVENTORY' | 'ACCOUNTANT' | 'VIEWER';

export interface AssistantConfigCell {
  role: AssistantConfigurableRole;
  enabled: boolean;
  capable: boolean;
  reason: string | null;
}

export interface AssistantConfigTopic {
  id: string;
  label: string;
  hint: string;
  cells: AssistantConfigCell[];
}

export interface AssistantConfigAction {
  id: string;
  label: string;
  hint: string;
  rule: string | null;
  level: AssistantActionLevel;
  allowedLevels: AssistantActionLevel[];
  roles: AssistantConfigCell[];
}

export interface AssistantConfigLimits {
  maxQuoteAmountWhatsapp: number | null;
  maxActionsPerDay: number;
  confirmExpiryMinutes: number;
}

export interface AssistantConfig {
  webEnabled: boolean;
  whatsappEnabled: boolean;
  salesOwnDataOnly: boolean;
  roles: AssistantConfigurableRole[];
  topics: AssistantConfigTopic[];
  actions: AssistantConfigAction[];
  limits: AssistantConfigLimits;
}

export interface UpdateAssistantConfig {
  webEnabled?: boolean;
  whatsappEnabled?: boolean;
  salesOwnDataOnly?: boolean;
  topicsByRole?: Record<string, AssistantConfigurableRole[]>;
  actionLevels?: Record<string, AssistantActionLevel>;
  actionRoles?: Record<string, AssistantConfigurableRole[]>;
  maxQuoteAmountWhatsapp?: number | null;
  maxActionsPerDay?: number;
  confirmExpiryMinutes?: number;
}

// Acciones (etapa 3): el asistente propone y el servidor ejecuta. La tarjeta
// viaja como `data` de un tool_result y queda guardada en el mensaje.
export type AssistantActionStatus = 'PENDING_CONFIRMATION' | 'DONE' | 'EXPIRED' | 'CANCELLED' | 'UNDONE' | 'FAILED';
export type AssistantActionLevel = 'OFF' | 'DRAFT' | 'DIRECT';

export interface AssistantActionCard {
  type: 'assistant_action';
  id: string;
  label: string;
  status: AssistantActionStatus;
  summary: string;
  expiresAt: string | null;
}

export function isActionCard(data: unknown): data is AssistantActionCard {
  return !!data && typeof data === 'object' && (data as { type?: unknown }).type === 'assistant_action';
}

export interface AssistantActionReply {
  reply: string;
  card: AssistantActionCard;
  messageId: string;
}

export const assistantActionsApi = {
  confirm: (id: string) => api.post<AssistantActionReply>(`/assistant/actions/${id}/confirm`).then((r) => r.data),
  cancel: (id: string) => api.post<AssistantActionReply>(`/assistant/actions/${id}/cancel`).then((r) => r.data),
  undo: (id: string) => api.post<AssistantActionCard>(`/assistant/actions/${id}/undo`).then((r) => r.data),
  invoiceDraft: (id: string) => api.get<AssistantInvoiceDraft>(`/assistant/actions/${id}/invoice-draft`).then((r) => r.data),
};

// Lo que dejó preparado "Preparar factura" para precargar Nueva factura.
export interface AssistantInvoiceDraft {
  customerId: string;
  customerName: string;
  lines: Array<{ articleVariantId: string; quantity: number; unitPrice: number }>;
  notes: string | null;
}

export const assistantConfigApi = {
  get: () => api.get<AssistantConfig>('/assistant/config').then((r) => r.data),
  update: (patch: UpdateAssistantConfig) => api.patch<AssistantConfig>('/assistant/config', patch).then((r) => r.data),
};

export type AssistantStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_start'; tool: string; label: string }
  | { type: 'tool_result'; tool: string; data: unknown }
  | { type: 'done'; messageId: string }
  | { type: 'error'; message: string };

/** Streaming token a token (Fase 3.5, docs/planesdemodulos/plan-asistente-ia-conversacional.md,
 * sección 7) - `fetch` en vez de `axios` (no soporta leer el body como
 * stream en el browser) y sin `EventSource` nativo (GET-only, sin headers
 * custom - el auth acá va por `Authorization`, no por cookie). El token se
 * lee de localStorage a mano, mismo lugar que el interceptor de `api.ts`. */
export async function streamAssistantMessage(message: string, onEvent: (event: AssistantStreamEvent) => void, signal?: AbortSignal): Promise<void> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const response = await fetch(`${API_BASE_URL}/assistant/message/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ message }),
    signal,
  });

  if (!response.ok || !response.body) {
    // Errores que cortan ANTES de arrancar el streaming (cupo agotado,
    // rate limit) siguen volviendo como JSON de error normal, no SSE -
    // ver AssistantController.sendMessageStream.
    let errorMessage = 'No se pudo consultar al asistente. Probá de nuevo.';
    try {
      const data: { message?: string | string[] } = await response.json();
      errorMessage = Array.isArray(data.message) ? data.message.join(' ') : data.message ?? errorMessage;
    } catch {
      // El body no era JSON - se mantiene el mensaje genérico.
    }
    onEvent({ type: 'error', message: errorMessage });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let separatorIndex: number;
    while ((separatorIndex = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);
      const dataLine = rawEvent.split('\n').find((line) => line.startsWith('data: '));
      if (dataLine) {
        onEvent(JSON.parse(dataLine.slice('data: '.length)));
      }
    }
  }
}
