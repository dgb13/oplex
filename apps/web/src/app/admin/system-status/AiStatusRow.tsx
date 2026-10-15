'use client';

import { adminAiApi, type AiStatus, type AiTestCode, type SystemStatusItem } from '@/lib/admin';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

const DATE_TIME = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const btn =
  'shrink-0 rounded-full border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40';

type Tone = 'green' | 'amber' | 'red';

const PILL: Record<Tone, string> = {
  green: 'bg-green-900/50 text-green-300',
  amber: 'bg-amber-900/50 text-amber-300',
  red: 'bg-red-900/50 text-red-300',
};

const TEST_LABEL: Record<AiTestCode, string> = {
  OK: 'OK',
  NO_KEY: 'Sin clave',
  INVALID_KEY: 'Clave inválida',
  NO_PERMISSION: 'Sin permiso',
  MODEL_NOT_FOUND: 'Modelo inexistente',
  NETWORK: 'Sin conexión',
  ERROR: 'Error',
};

function apiError(err: unknown, fallback: string): string {
  const message = (err as AxiosError<{ message?: string | string[] }>)?.response?.data?.message;
  return Array.isArray(message) ? message.join(', ') : (message ?? fallback);
}

function Pill({ tone, children, title }: { tone: Tone; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${PILL[tone]}`}>
      {children}
    </span>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded-[5px] border border-slate-800 bg-[#0b1222] px-1.5 py-px font-mono text-[11.5px] text-slate-200">{children}</code>;
}

/** Estado de cada clave: sin cargar, sin probar, funciona o con error. */
function keyState(status: AiStatus, group: AiStatus['keys'][number]): { tone: Tone; label: string } {
  if (!group.configured) return { tone: 'red', label: 'Sin cargar' };
  const tests = status.features.filter((f) => f.group === group.group).map((f) => f.lastTest);
  if (tests.some((t) => !t)) return { tone: 'amber', label: 'Sin probar' };
  if (tests.every((t) => t?.code === 'OK')) return { tone: 'green', label: 'Funciona' };
  return { tone: 'red', label: 'Con error' };
}

function summary(status: AiStatus): { tone: Tone; text: string } {
  const loaded = status.keys.filter((k) => k.configured);
  const head = `${loaded.length} de ${status.keys.length} claves`;
  if (loaded.length === 0) return { tone: 'red', text: `${head} · faltan las dos` };
  const missing = status.keys.find((k) => !k.configured);
  if (missing) return { tone: 'amber', text: `${head} · falta la de ${missing.label.toLowerCase()}` };
  const failing = status.features.filter((f) => f.lastTest && f.lastTest.code !== 'OK').length;
  if (failing > 0) return { tone: 'amber', text: `${head} · la última prueba falló en ${failing} ${failing === 1 ? 'función' : 'funciones'}` };
  if (!status.lastTestAt) return { tone: 'green', text: `${head} · todavía sin probar` };
  return { tone: 'green', text: `${head} · funciona` };
}

/**
 * Inteligencia artificial (Anthropic): las dos claves (chat y lectura de
 * documentos), qué función usa cada una y con qué modelo, la última prueba,
 * el uso del mes y la última falla (mockup aprobado el 2026-10-14). "Probar"
 * consulta a Anthropic si cada clave y cada modelo existen, sin costo.
 */
export function AiStatusRow({ item }: { item: SystemStatusItem }) {
  const queryClient = useQueryClient();
  const { data: status } = useQuery({ queryKey: ['admin-ai'], queryFn: adminAiApi.getStatus });
  const [open, setOpen] = useState<boolean | null>(null);
  const test = useMutation({
    mutationFn: adminAiApi.test,
    onSuccess: (next) => {
      queryClient.setQueryData(['admin-ai'], next);
      queryClient.invalidateQueries({ queryKey: ['admin-system-status'] });
    },
  });

  const state = status ? summary(status) : { tone: (item.configured ? 'green' : 'amber') as Tone, text: 'Cargando...' };
  // Abierto de entrada sólo si algo necesita atención.
  const isOpen = open ?? state.tone !== 'green';
  const missingKeys = status?.keys.filter((k) => !k.configured) ?? [];
  const lastTestAt = status?.lastTestAt ? DATE_TIME.format(new Date(status.lastTestAt)) : null;

  return (
    <div
      className={`overflow-hidden rounded-xl border ${
        state.tone === 'red' ? 'border-red-900 bg-red-950/30' : state.tone === 'amber' ? 'border-amber-900 bg-amber-950/20' : 'border-slate-800 bg-slate-900'
      }`}
    >
      <div className="flex flex-wrap items-center gap-3 p-4">
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${state.tone === 'red' ? 'bg-red-500' : state.tone === 'amber' ? 'bg-amber-500' : 'bg-green-500'}`}
          aria-hidden
        />
        <p className="text-sm font-medium text-slate-200">{item.label}</p>
        <p className="min-w-[200px] flex-1 text-xs text-slate-400">
          <b className={state.tone === 'red' ? 'text-red-300' : state.tone === 'amber' ? 'text-amber-300' : 'text-green-300'}>
            {state.text.split(' · ')[0]}
          </b>
          {state.text.includes(' · ') && ` · ${state.text.split(' · ').slice(1).join(' · ')}`}
        </p>
        <button type="button" className={btn} aria-expanded={isOpen} onClick={() => setOpen(!isOpen)}>
          {isOpen ? 'Ocultar detalle' : 'Ver detalle'}
        </button>
      </div>

      {isOpen && status && (
        <div className="flex flex-col gap-4 border-t border-slate-800 bg-[#111a2e] p-4">
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Claves</h3>
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
              {status.keys.map((k) => {
                const ks = keyState(status, k);
                return (
                  <div key={k.group} className="flex min-w-0 flex-col gap-1.5 rounded-[10px] border border-slate-800 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-200">{k.label}</span>
                      <Pill tone={ks.tone}>{ks.label}</Pill>
                    </div>
                    <p className="text-xs text-slate-400">
                      <Code>{k.envVar}</Code> · {k.configured ? 'cargada' : 'vacía'}
                    </p>
                    <p className="text-xs leading-relaxed text-slate-400">
                      Lo usan: {k.usedBy}.{!k.configured && ' Mientras falte, esas funciones dan error.'}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Funciones y modelos</h3>
            <div className="overflow-x-auto rounded-[10px] border border-slate-800">
              <table className="w-full border-collapse text-left text-[12.5px] tabular-nums">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-slate-500">
                    <th className="px-2.5 py-2 font-semibold">Función</th>
                    <th className="px-2.5 py-2 font-semibold">Clave</th>
                    <th className="px-2.5 py-2 font-semibold">Modelo</th>
                    <th className="px-2.5 py-2 font-semibold">Última prueba</th>
                    <th className="px-2.5 py-2 text-right font-semibold">Uso del mes</th>
                  </tr>
                </thead>
                <tbody>
                  {status.features.map((f) => (
                    <tr key={f.key} className="border-t border-slate-800 align-top text-slate-200">
                      <td className="px-2.5 py-2">{f.label}</td>
                      <td className="px-2.5 py-2">{f.group === 'assistant' ? 'Chat' : 'Documentos'}</td>
                      <td className="px-2.5 py-2">
                        <Code>{f.model}</Code>
                      </td>
                      <td className="px-2.5 py-2">
                        {f.lastTest ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Pill tone={f.lastTest.code === 'OK' ? 'green' : 'red'} title={f.lastTest.message}>
                              {TEST_LABEL[f.lastTest.code]}
                            </Pill>
                            {f.lastTest.code !== 'NO_KEY' && lastTestAt}
                          </span>
                        ) : (
                          <span className="text-slate-500">Sin probar</span>
                        )}
                      </td>
                      <td className="px-2.5 py-2 text-right">{f.usage ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-1.5 text-xs text-slate-400">
              El modelo sale del <Code>.env</Code> (<Code>ANTHROPIC_MODEL</Code>, <Code>ANTHROPIC_ASSISTANT_MODEL</Code>,{' '}
              <Code>ANTHROPIC_ASSISTANT_HELP_MODEL</Code>, <Code>ANTHROPIC_IMPORT_MODEL</Code>) o del valor por defecto de Oplex si están vacías.
              &quot;—&quot; = Oplex no registra ese uso.
            </p>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Última falla</h3>
            {status.lastFailure ? (
              <div className="rounded-[10px] border border-red-900/60 bg-red-950/30 px-3 py-2.5 text-[12.5px] leading-relaxed text-slate-300">
                <b className="text-white">
                  {DATE_TIME.format(new Date(status.lastFailure.at))} · {status.lastFailure.feature}
                </b>
                {status.lastFailure.tenantName && ` (empresa ${status.lastFailure.tenantName})`}
                <br />
                <span className="break-words">{status.lastFailure.reason ?? 'Sin detalle.'}</span>
              </div>
            ) : (
              <p className="text-xs text-slate-400">Sin fallas registradas.</p>
            )}
            <p className="mt-1.5 text-xs text-slate-400">
              Se guardan las últimas 20 fallas de IA con fecha, función, empresa y motivo (nunca el documento). Lo que ve el usuario sigue
              siendo &quot;No se pudo leer la constancia con IA en este momento&quot;.
            </p>
          </section>

          {missingKeys.length > 0 && (
            <section className="text-[12.5px] leading-relaxed text-slate-400">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Cómo cargar la clave que falta
              </h3>
              <ol className="ml-[18px] list-decimal">
                <li>En console.anthropic.com creá una clave nueva (conviene una aparte para cada uso, para ver el gasto por separado).</li>
                <li>
                  En el servidor, agregala en <Code>/opt/oplex/.env</Code> como{' '}
                  {missingKeys.map((k, i) => (
                    <span key={k.envVar}>
                      {i > 0 && ' y '}
                      <Code>{k.envVar}=…</Code>
                    </span>
                  ))}{' '}
                  y recreá la API.
                </li>
                <li>
                  Volvé acá y tocá <b className="text-slate-200">Probar</b>.
                </li>
              </ol>
            </section>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={test.isPending}
              onClick={() => test.mutate()}
              className="rounded-full border border-indigo-400 bg-indigo-400 px-3 py-1 text-xs font-bold text-[#0b1020] transition hover:bg-indigo-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {test.isPending ? 'Probando...' : 'Probar'}
            </button>
            <span className="text-xs text-slate-400">
              Consulta a Anthropic cada clave y cada modelo · sin costo{lastTestAt ? ` · última: ${lastTestAt}` : ''}
            </span>
          </div>
          {test.isError && <p className="text-xs text-red-300">✕ {apiError(test.error, 'No se pudo hacer la prueba.')}</p>}
        </div>
      )}
    </div>
  );
}
