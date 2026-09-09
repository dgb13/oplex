'use client';

import { useEffect, useRef, useState } from 'react';
import { assistantApi, FALLBACK_ASSISTANT_NAME, streamAssistantMessage, type AssistantMessageFeedback } from '@/lib/assistant';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import ReactMarkdown from 'react-markdown';

interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant' | 'error';
  text: string;
  feedback?: AssistantMessageFeedback | null;
}

// Compartido entre la burbuja de un mensaje ya cerrado (MessageBubble) y la
// burbuja "en vivo" mientras el texto sigue llegando por streaming (ver
// isStreaming más abajo) - mismo estilo de markdown para las dos.
const ASSISTANT_BUBBLE_CLASS =
  'max-w-[85%] rounded-2xl rounded-bl-sm bg-slate-100 dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 [&_p]:mb-2 last:[&_p]:mb-0 [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:mb-0.5 [&_strong]:font-semibold [&_a]:text-indigo-600 dark:[&_a]:text-indigo-400 [&_a]:underline';

const DEFAULT_QUESTIONS = [
  '¿Qué artículos se vendieron más este mes?',
  '¿Qué clientes me deben y desde cuándo?',
  '¿Cuánto tengo en caja ahora?',
];

// Sugerencias contextuales por pantalla (docs/plan-asistente-ia-conversacional.md,
// sección 7) - primer prefijo de ruta que matchea gana, DEFAULT_QUESTIONS
// si ninguno matchea.
const CONTEXTUAL_QUESTIONS: Array<{ prefix: string; questions: string[] }> = [
  {
    prefix: '/purchases',
    questions: ['¿Qué facturas de compra tengo pendientes?', '¿Cuánto le debo a mis proveedores?'],
  },
  {
    prefix: '/payables',
    questions: ['¿Cuánto le debo a mis proveedores?', '¿Qué proveedor tiene el saldo más alto?'],
  },
  { prefix: '/pos', questions: ['¿Cuánto tengo en caja ahora?', '¿Cómo abro un turno de caja?'] },
  {
    prefix: '/receivables',
    questions: ['¿Qué clientes me deben y desde cuándo?', '¿Quién está más vencido?'],
  },
  {
    prefix: '/invoicing',
    questions: ['¿Cuánto facturé este mes?', '¿Cómo hago una nota de crédito?'],
  },
  {
    prefix: '/inventory',
    questions: ['¿Qué artículos están bajo el stock mínimo?', '¿Cuánto stock tengo de un producto puntual?'],
  },
];

function getContextualQuestions(pathname: string | null): string[] {
  const match = CONTEXTUAL_QUESTIONS.find((c) => pathname?.startsWith(c.prefix));
  return match?.questions ?? DEFAULT_QUESTIONS;
}

/** Widget flotante del asistente de IA - Fase 3
 * (docs/plan-asistente-ia-conversacional.md, sección 9): historial
 * persistente (carga la conversación activa al montar), feedback 👍/👎 por
 * respuesta, sugerencias contextuales por pantalla. Todavía sin streaming
 * (respuesta completa de una vez). El nombre nunca está hardcodeado, se lee
 * de PlatformSettings.assistantDisplayName. */
export default function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  // Estado de la respuesta en curso (docs/plan-asistente-ia-conversacional.md,
  // sección 7): streamingTool es la etiqueta liviana ("Consultando
  // ventas…") mientras corre una tool call, streamingText es el texto de
  // la respuesta final acumulado a medida que llega. Ninguno de los dos
  // vive en `messages` hasta que llega el evento `done` - recién ahí se
  // convierte en un ChatMessage con id real (para poder calificarlo).
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingTool, setStreamingTool] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const queryClient = useQueryClient();

  const { data: settings } = useQuery({ queryKey: ['assistant-settings'], queryFn: assistantApi.getSettings });
  const assistantName = settings?.assistantDisplayName || FALLBACK_ASSISTANT_NAME;

  const { data: conversation } = useQuery({ queryKey: ['assistant-conversation'], queryFn: assistantApi.getConversation });

  // Se carga UNA vez al llegar - si el usuario ya mandó algo antes de que
  // la respuesta vuelva (poco probable, pero posible), no se pisa lo que
  // ya está en pantalla.
  useEffect(() => {
    if (conversation && !historyLoaded) {
      setMessages(
        conversation.messages.map((m) => ({
          id: m.id,
          role: m.role === 'USER' ? 'user' : 'assistant',
          text: m.content,
          feedback: m.feedback,
        })),
      );
      setHistoryLoaded(true);
    }
  }, [conversation, historyLoaded]);

  const feedbackMutation = useMutation({
    mutationFn: ({ messageId, feedback }: { messageId: string; feedback: AssistantMessageFeedback }) =>
      assistantApi.setFeedback(messageId, feedback),
  });

  const newConversationMutation = useMutation({
    mutationFn: assistantApi.startNewConversation,
    onSuccess: () => {
      setMessages([]);
      void queryClient.invalidateQueries({ queryKey: ['assistant-conversation'] });
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isStreaming, streamingText]);

  function handleSend(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    setMessages((prev) => [...prev, { role: 'user', text: trimmed }]);
    setDraft('');
    setIsStreaming(true);
    setStreamingTool(null);
    setStreamingText('');

    // Acumulado en una variable local, no en el state `streamingText`: el
    // handler de 'done' de más abajo necesita el texto completo apenas
    // llega, sin esperar el próximo render (leer el state acá adentro
    // devolvería el valor de la clausura del momento en que se llamó a
    // handleSend, no el actualizado).
    let fullText = '';
    streamAssistantMessage(trimmed, (event) => {
      if (event.type === 'tool_start') {
        setStreamingTool(event.label);
      } else if (event.type === 'text') {
        fullText += event.text;
        setStreamingTool(null);
        setStreamingText(fullText);
      } else if (event.type === 'done') {
        setMessages((prev) => [...prev, { id: event.messageId, role: 'assistant', text: fullText, feedback: null }]);
        setIsStreaming(false);
        setStreamingTool(null);
        setStreamingText('');
      } else if (event.type === 'error') {
        setMessages((prev) => [...prev, { role: 'error', text: event.message }]);
        setIsStreaming(false);
        setStreamingTool(null);
        setStreamingText('');
      }
    }).catch(() => {
      setMessages((prev) => [...prev, { role: 'error', text: 'No se pudo consultar al asistente. Probá de nuevo.' }]);
      setIsStreaming(false);
      setStreamingTool(null);
      setStreamingText('');
    });
  }

  function handleFeedback(messageId: string, feedback: AssistantMessageFeedback) {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, feedback } : m)));
    feedbackMutation.mutate({ messageId, feedback });
  }

  return (
    <>
      {open && (
        <div className="fixed bottom-20 right-6 z-40 flex h-[32rem] w-96 flex-col overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{assistantName}</p>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  onClick={() => newConversationMutation.mutate()}
                  disabled={newConversationMutation.isPending}
                  title="Nueva conversación"
                  aria-label="Nueva conversación"
                  className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  <NewChatIcon />
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
                className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <CloseIcon />
              </button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.length === 0 && (
              <div className="flex h-full flex-col justify-end gap-2">
                <p className="text-xs text-slate-500 dark:text-slate-500">Probá preguntar:</p>
                {getContextualQuestions(pathname).map((q) => (
                  <button
                    key={q}
                    onClick={() => handleSend(q)}
                    className="rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-left text-xs text-slate-600 dark:text-slate-400 transition hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m, i) => (
              <MessageBubble key={m.id ?? i} message={m} onFeedback={handleFeedback} />
            ))}
            {isStreaming && (
              <div className="flex justify-start">
                {streamingText ? (
                  <div className={ASSISTANT_BUBBLE_CLASS}>
                    <ReactMarkdown>{streamingText}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="rounded-2xl rounded-bl-sm bg-slate-100 dark:bg-slate-800 px-3 py-2 text-sm italic text-slate-500 dark:text-slate-400">
                    {streamingTool ?? 'Pensando…'}
                  </div>
                )}
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend(draft);
            }}
            className="flex items-center gap-2 border-t border-slate-200 dark:border-slate-800 p-3"
          >
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Escribí tu consulta..."
              disabled={isStreaming}
              className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isStreaming || draft.trim() === ''}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              Enviar
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Cerrar asistente' : `Hablar con ${assistantName}`}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-xl transition hover:bg-indigo-500"
      >
        {open ? <CloseIcon /> : <ChatIcon />}
      </button>
    </>
  );
}

function MessageBubble({
  message,
  onFeedback,
}: {
  message: ChatMessage;
  onFeedback: (messageId: string, feedback: AssistantMessageFeedback) => void;
}) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-indigo-600 px-3 py-2 text-sm text-white">{message.text}</div>
      </div>
    );
  }
  if (message.role === 'error') {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-2xl rounded-bl-sm border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          {message.text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-1">
      <div className={ASSISTANT_BUBBLE_CLASS}>
        <ReactMarkdown>{message.text}</ReactMarkdown>
      </div>
      {message.id && (
        <div className="flex items-center gap-1 pl-1">
          <button
            onClick={() => onFeedback(message.id as string, 'UP')}
            aria-label="Respuesta útil"
            className={`rounded p-0.5 transition hover:bg-slate-100 dark:hover:bg-slate-800 ${
              message.feedback === 'UP' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
            }`}
          >
            <ThumbUpIcon />
          </button>
          <button
            onClick={() => onFeedback(message.id as string, 'DOWN')}
            aria-label="Respuesta no útil"
            className={`rounded p-0.5 transition hover:bg-slate-100 dark:hover:bg-slate-800 ${
              message.feedback === 'DOWN' ? 'text-red-600 dark:text-red-400' : 'text-slate-400'
            }`}
          >
            <ThumbDownIcon />
          </button>
        </div>
      )}
    </div>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-5 w-5">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function NewChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function ThumbUpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <path d="M7 10v12M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
    </svg>
  );
}

function ThumbDownIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <path d="M17 14V2M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
    </svg>
  );
}
