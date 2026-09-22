'use client';

import { adminSystemStatusApi, type LiveTokenCheckResult, type SystemStatusItem } from '@/lib/admin';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';

const DATE_TIME_FORMAT = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' });

/**
 * "¿Está configurado o no?" para cada integración externa opcional que
 * este servidor lee de su .env - nunca "¿el token todavía es válido?"
 * (eso requeriría pegarle en vivo a cada proveedor, ver el doc comment
 * de AdminSystemStatusService del lado del backend). Refetch cada 60s -
 * suficiente para notar un cambio de .env tras un restart del server,
 * sin pegarle a esto en cada render.
 */
export default function AdminSystemStatusPage() {
  const { data: items, isLoading } = useQuery({
    queryKey: ['admin-system-status'],
    queryFn: adminSystemStatusApi.getStatus,
    refetchInterval: 60_000,
  });

  const missingCount = items?.filter((i) => !i.configured).length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-white">Configuración del sistema</h1>
      <p className="text-xs text-slate-500">
        Estado de las variables de entorno de cada integración externa opcional (nunca se muestra el
        valor, sólo si está presente) - ver AdminSystemStatusService. No es un chequeo en vivo contra
        el proveedor: &quot;Configurado&quot; significa que las credenciales están cargadas, no que
        todavía sean válidas.
      </p>

      {isLoading || !items ? (
        <p className="text-sm text-slate-500">Cargando...</p>
      ) : (
        <>
          {missingCount > 0 && (
            <div className="rounded-xl border border-amber-900 bg-amber-950/40 p-4 text-sm text-amber-300">
              {missingCount} integración{missingCount !== 1 ? 'es' : ''} sin configurar en esta máquina.
            </div>
          )}
          <div className="flex flex-col gap-3">
            {items.map((item) =>
              item.key === 'whatsapp' ? (
                <WhatsAppStatusRow key={item.key} item={item} />
              ) : (
                <StatusRow key={item.key} item={item} />
              ),
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatusRow({ item, liveCheck }: { item: SystemStatusItem; liveCheck?: React.ReactNode }) {
  return (
    <div
      className={`flex items-center justify-between gap-4 rounded-xl border p-4 ${
        item.configured ? 'border-slate-800 bg-slate-900' : 'border-red-900 bg-red-950/30'
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${item.configured ? 'bg-green-500' : 'bg-red-500'}`}
          aria-hidden
        />
        <div>
          <p className="text-sm font-medium text-slate-200">{item.label}</p>
          {item.detail && <p className="mt-0.5 text-xs text-red-300">{item.detail}</p>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {liveCheck}
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
            item.configured ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'
          }`}
        >
          {item.configured ? 'Configurado' : 'Falta configurar'}
        </span>
      </div>
    </div>
  );
}

/**
 * "Verificar ahora" es la única excepción a "nunca pegar en vivo contra el
 * proveedor" de esta pantalla (ver AdminSystemStatusService.
 * verifyWhatsAppToken) - opt-in, sólo en esta fila, porque el token de
 * WhatsApp es el único de esta lista que vence solo en horas sin que nadie
 * lo toque (el de la pantalla "Test API" de Meta). El resultado vive en
 * estado local nomás - no se persiste ni se vuelve a pedir en cada carga
 * de la página, es una foto del momento en que se apretó el botón.
 */
function WhatsAppStatusRow({ item }: { item: SystemStatusItem }) {
  const [result, setResult] = useState<LiveTokenCheckResult | null>(null);
  const [showLinks, setShowLinks] = useState(false);
  const mutation = useMutation({
    mutationFn: adminSystemStatusApi.verifyWhatsApp,
    onSuccess: setResult,
  });

  const verifyButton = (
    <button
      type="button"
      onClick={() => {
        setResult(null);
        mutation.mutate();
      }}
      disabled={mutation.isPending || !item.configured}
      className="shrink-0 rounded-full border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
      title={!item.configured ? 'Faltan variables de entorno - no hay nada que verificar todavía' : undefined}
    >
      {mutation.isPending ? 'Verificando...' : 'Verificar ahora'}
    </button>
  );

  // El conteo de números vinculados no depende de si el .env está
  // configurado ni de si el token es válido - son datos nuestros, no de
  // Meta (ver AdminSystemStatusService.getStatus). Siempre clickeable,
  // incluso en 0, para que el admin pueda confirmar que efectivamente no
  // hay ninguno vinculado todavía.
  const linksButton = (
    <button
      type="button"
      onClick={() => setShowLinks((v) => !v)}
      className="shrink-0 rounded-full border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:border-slate-500 hover:text-white"
    >
      {item.linksCount ?? 0} número{item.linksCount === 1 ? '' : 's'} vinculado{item.linksCount === 1 ? '' : 's'}
    </button>
  );
  const liveCheck = (
    <>
      {linksButton}
      {verifyButton}
    </>
  );

  // El estado "estructural" (item.configured) manda mientras no haya un
  // resultado en vivo todavía, o mientras las variables directamente
  // faltan (ahí no tiene sentido mostrar amarillo - no hay token que
  // pegarle). Un resultado en vivo inválido pisa el verde con amarillo;
  // uno válido simplemente confirma el verde que ya estaba.
  const row =
    !item.configured || !result ? (
      <StatusRow item={item} liveCheck={liveCheck} />
    ) : result.valid ? (
      <StatusRow item={{ ...item, detail: undefined }} liveCheck={liveCheck} />
    ) : (
      <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-900 bg-amber-950/30 p-4">
        <div className="flex items-center gap-3">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
          <div>
            <p className="text-sm font-medium text-slate-200">{item.label}</p>
            <p className="mt-0.5 text-xs text-amber-300">
              {result.detail ?? 'El token está cargado pero Meta lo rechazó.'}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {liveCheck}
          <span className="shrink-0 rounded-full bg-amber-900/50 px-2.5 py-1 text-xs font-medium text-amber-300">
            Token inválido
          </span>
        </div>
      </div>
    );

  return (
    <div className="flex flex-col gap-2">
      {row}
      {showLinks && <WhatsAppLinksPanel />}
    </div>
  );
}

/**
 * Barra de progreso del cupo mensual del Asistente de IA - del TENANT
 * completo (todos los usuarios/canales), no de este número puntual, ver
 * el doc comment de planQuota/planUsed en WhatsAppLinkSummary. quota=null
 * significa que el plan de ese tenant no incluye el Asistente de IA -
 * nada que medir, se muestra el nombre del plan nomás. Mismos cortes de
 * color que el resto de la app usa para semáforos de cupo (verde hasta
 * 70%, amber hasta 90%, rojo de ahí en adelante).
 */
function PlanUsageBar({ planName, quota, used }: { planName: string; quota: number | null; used: number }) {
  if (quota == null) {
    return <span className="text-slate-500">{planName} (sin Asistente de IA)</span>;
  }
  const pct = quota === 0 ? 100 : Math.min(100, Math.round((used / quota) * 100));
  const barColor = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-green-500';
  return (
    <div className="flex min-w-[140px] flex-col gap-1">
      <span className="text-slate-400">
        {used}/{quota} · {planName}
      </span>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Detalle por número - se pide recién al abrir (ver el doc comment de
 * AdminSystemStatusController.listWhatsAppLinks), no en cada carga de la
 * página. messageCount es "mensajes del asistente de ese usuario, todos
 * los canales" - AssistantConversation no distingue canal, así que no hay
 * forma de aislar sólo lo mandado por WhatsApp (ver el doc comment de
 * WhatsAppLinkSummary). El consumo del plan (columna aparte) es distinto:
 * siempre del TENANT completo y del mes en curso, no de este usuario ni
 * de todo el historial - se repite igual en cada fila de un mismo tenant
 * a propósito. */
function WhatsAppLinksPanel() {
  const { data: links, isLoading } = useQuery({
    queryKey: ['admin-whatsapp-links'],
    queryFn: adminSystemStatusApi.listWhatsAppLinks,
  });

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
      {isLoading || !links ? (
        <p className="text-xs text-slate-500">Cargando...</p>
      ) : links.length === 0 ? (
        <p className="text-xs text-slate-500">Ningún número vinculado todavía en esta plataforma.</p>
      ) : (
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-slate-500">
              <th className="pb-2 pr-4 font-normal">Teléfono</th>
              <th className="pb-2 pr-4 font-normal">Usuario</th>
              <th className="pb-2 pr-4 font-normal">Tenant</th>
              <th className="pb-2 pr-4 font-normal">Vinculado</th>
              <th className="pb-2 pr-4 font-normal">Mensajes del asistente (todos los canales)</th>
              <th className="pb-2 font-normal">Consumo del plan (tenant, mes en curso)</th>
            </tr>
          </thead>
          <tbody>
            {links.map((link) => (
              <tr key={link.phoneE164} className="border-t border-slate-800/60">
                <td className="py-2 pr-4 text-slate-200">{link.phoneE164}</td>
                <td className="py-2 pr-4 text-slate-200">{link.userEmail}</td>
                <td className="py-2 pr-4 text-slate-200">{link.tenantName}</td>
                <td className="py-2 pr-4 text-slate-400">{DATE_TIME_FORMAT.format(new Date(link.linkedAt))}</td>
                <td className="py-2 pr-4 text-slate-200">{link.messageCount}</td>
                <td className="py-2">
                  <PlanUsageBar planName={link.planName} quota={link.planQuota} used={link.planUsed} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
