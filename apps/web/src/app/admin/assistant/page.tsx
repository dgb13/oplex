'use client';

import { useEffect, useState } from 'react';
import { adminAssistantApi } from '@/lib/admin';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const FALLBACK_NAME = 'Asistente Oplex';

/** Nombre + rate limit del asistente de IA conversacional - configuración
 * de plataforma, nunca un texto/número fijo en el código (ver
 * docs/plan-asistente-ia-conversacional.md, secciones 1 y 8.2). Mismo
 * patrón GET+PATCH que /admin/ai-invoice-scan, pero con inputs de texto/
 * número en vez de un toggle. */
export default function AdminAssistantPage() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useQuery({
    queryKey: ['admin-assistant-settings'],
    queryFn: adminAssistantApi.getSettings,
  });

  const [name, setName] = useState('');
  const [windowMinutes, setWindowMinutes] = useState('');
  const [maxMessages, setMaxMessages] = useState('');

  useEffect(() => {
    if (settings) {
      setName(settings.assistantDisplayName ?? '');
      setWindowMinutes(String(settings.assistantRateLimitWindowMinutes));
      setMaxMessages(String(settings.assistantRateLimitMaxMessages));
    }
  }, [settings]);

  const queryKey = ['admin-assistant-settings'];
  const updateMutation = useMutation({
    mutationFn: adminAssistantApi.updateSettings,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
  });

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-xl font-semibold text-white">Asistente de IA</h1>

      {isLoading || !settings ? (
        <p className="text-sm text-slate-500">Cargando...</p>
      ) : (
        <>
          <div className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900 p-6">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">Nombre</h2>
              <p className="mt-1 text-sm text-slate-400">
                Nombre que ve el usuario en el widget del chat y (más adelante) en los mensajes de WhatsApp. Sin
                valor cargado, se muestra <span className="text-slate-300">&quot;{FALLBACK_NAME}&quot;</span> como
                genérico.
              </p>
            </div>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-slate-200">Nombre del asistente</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={FALLBACK_NAME}
                maxLength={40}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
              />
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => updateMutation.mutate({ assistantDisplayName: name.trim() === '' ? null : name.trim() })}
                disabled={updateMutation.isPending}
                className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
              >
                Guardar
              </button>
              {settings.assistantDisplayName != null && (
                <button
                  type="button"
                  onClick={() => {
                    setName('');
                    updateMutation.mutate({ assistantDisplayName: null });
                  }}
                  disabled={updateMutation.isPending}
                  className="rounded-lg border border-slate-700 px-4 py-1.5 text-sm font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
                >
                  Restaurar genérico
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900 p-6">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">Rate limit</h2>
              <p className="mt-1 text-sm text-slate-400">
                Máximo de preguntas que un mismo usuario puede hacerle al asistente dentro de la ventana de tiempo -
                corta un loop accidental o abuso, independiente del cupo mensual por plan (ver Planes → Cupo
                Asistente/mes).
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-slate-200">Ventana (minutos)</span>
                <input
                  type="number"
                  min={1}
                  value={windowMinutes}
                  onChange={(e) => setWindowMinutes(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-slate-100 focus:border-indigo-500 focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-slate-200">Máximo de preguntas</span>
                <input
                  type="number"
                  min={1}
                  value={maxMessages}
                  onChange={(e) => setMaxMessages(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-slate-100 focus:border-indigo-500 focus:outline-none"
                />
              </label>
            </div>
            <div>
              <button
                type="button"
                onClick={() =>
                  updateMutation.mutate({
                    assistantRateLimitWindowMinutes: Number(windowMinutes),
                    assistantRateLimitMaxMessages: Number(maxMessages),
                  })
                }
                disabled={updateMutation.isPending || !windowMinutes || !maxMessages}
                className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
              >
                Guardar
              </button>
            </div>
          </div>

          <UnansweredQuestionsCard />
        </>
      )}
    </div>
  );
}

/** Insumo para priorizar qué agregar al catálogo de herramientas del
 * asistente sin adivinar (ver AssistantSettingsService.getUnansweredQuestions):
 * preguntas de "datos" (sobre el propio negocio) que el modelo terminó
 * respondiendo en texto libre sin llamar a ninguna herramienta - casi
 * siempre un "no tengo cómo consultar eso". Últimos 30 días, cross-tenant. */
function UnansweredQuestionsCard() {
  const { data: questions, isLoading } = useQuery({
    queryKey: ['admin-assistant-unanswered'],
    queryFn: adminAssistantApi.getUnansweredQuestions,
  });

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900 p-6">
      <div>
        <h2 className="text-sm font-semibold text-slate-100">Preguntas sin responder</h2>
        <p className="mt-1 text-sm text-slate-400">
          Preguntas sobre datos del negocio que el asistente no pudo responder con ninguna herramienta actual, de
          cualquier tenant, últimos 30 días. Sirve para decidir qué agregar al catálogo.
        </p>
      </div>

      {isLoading || !questions ? (
        <p className="text-sm text-slate-500">Cargando...</p>
      ) : questions.length === 0 ? (
        <p className="text-sm text-slate-500">Ninguna en los últimos 30 días.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-slate-800">
          {questions.map((q) => (
            <li key={q.id} className="flex flex-col gap-1 py-3 text-sm first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-4">
                <span className="font-medium text-slate-200">{q.tenantName}</span>
                <span className="whitespace-nowrap text-xs text-slate-500">
                  {new Date(q.createdAt).toLocaleString('es-AR')}
                </span>
              </div>
              <p className="text-slate-300">{q.question ?? <span className="italic text-slate-500">(sin pregunta registrada)</span>}</p>
              <p className="text-xs text-slate-500">Respondió: &quot;{q.answer}&quot;</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
