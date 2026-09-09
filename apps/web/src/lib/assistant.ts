import { api } from '@/lib/api';

export interface AssistantSettings {
  assistantDisplayName: string | null;
}

export const FALLBACK_ASSISTANT_NAME = 'Asistente Oplex';

export type AssistantMessageRole = 'USER' | 'ASSISTANT';
export type AssistantMessageFeedback = 'UP' | 'DOWN';

export interface AssistantMessage {
  id: string;
  role: AssistantMessageRole;
  content: string;
  feedback: AssistantMessageFeedback | null;
  createdAt: string;
}

// Widget de chat (docs/plan-asistente-ia-conversacional.md) - Fase 3 suma
// historial persistente (la conversación activa se carga al montar el
// widget, ver AssistantConversationService en el backend) y feedback
// 👍/👎 por respuesta.
export const assistantApi = {
  getSettings: () => api.get<AssistantSettings>('/assistant/settings').then((r) => r.data),
  getConversation: () => api.get<{ messages: AssistantMessage[] }>('/assistant/conversation').then((r) => r.data),
  startNewConversation: () => api.post<{ messages: AssistantMessage[] }>('/assistant/conversation/new').then((r) => r.data),
  sendMessage: (message: string) =>
    api.post<{ reply: string; messageId: string }>('/assistant/message', { message }).then((r) => r.data),
  setFeedback: (messageId: string, feedback: AssistantMessageFeedback) =>
    api.patch(`/assistant/messages/${messageId}/feedback`, { feedback }).then((r) => r.data),
};
