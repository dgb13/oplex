import { api, API_BASE_URL } from '@/lib/api';

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

export type AssistantStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_start'; tool: string; label: string }
  | { type: 'done'; messageId: string }
  | { type: 'error'; message: string };

/** Streaming token a token (Fase 3.5, docs/plan-asistente-ia-conversacional.md,
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
