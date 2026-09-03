'use client';

import AppShell from '@/components/AppShell';
import { posApi, type DailyPosition } from '@/lib/pos';
import { useQuery } from '@tanstack/react-query';
import { Lock, Plus, Unlock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import CreateRegisterModal from './CreateRegisterModal';
import OpenSessionModal from './OpenSessionModal';
import PosThemePicker from './PosThemePicker';

export default function PosSelectorPage() {
  const router = useRouter();
  const [openingRegisterId, setOpeningRegisterId] = useState<string | null>(null);
  const [creatingRegister, setCreatingRegister] = useState(false);

  const registersQuery = useQuery({ queryKey: ['pos-registers'], queryFn: () => posApi.listRegisters() });
  const openSessionsQuery = useQuery({ queryKey: ['pos-open-sessions'], queryFn: posApi.listOpenSessions });
  // Refetch corto - franja de sólo lectura, tiene que reflejar abrir/cerrar
  // turnos en otras cajas "en vivo" sin que el usuario recargue la página.
  const dashboardQuery = useQuery({
    queryKey: ['pos-dashboard'],
    queryFn: posApi.getDailyPosition,
    refetchInterval: 15000,
  });

  const openSessionByRegister = new Map(
    (openSessionsQuery.data ?? []).map((s) => [s.registerId, s]),
  );

  function handleCardClick(registerId: string) {
    const session = openSessionByRegister.get(registerId);
    if (session) {
      router.push(`/pos/sell?registerId=${registerId}`);
    } else {
      setOpeningRegisterId(registerId);
    }
  }

  return (
    <AppShell>
      {/* -m-6/p-6 cancela el padding de <main> en AppShell para que el fondo
          temeado del POS cubra todo el área de contenido - si no, el borde
          de 24px seguiría mostrando el fondo del tema global claro/oscuro
          del resto del ERP en vez del elegido acá. */}
      <div className="-m-6 flex min-h-[calc(100vh-57px)] flex-col gap-6 bg-slate-50 p-6 text-slate-900 pos-dark:bg-slate-950 pos-dark:text-slate-100 pos-contrast:bg-black pos-contrast:text-white pos-emerald:bg-emerald-50 pos-emerald:text-slate-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold text-slate-900 pos-dark:text-slate-100 pos-contrast:text-white pos-emerald:text-slate-900">
              Caja
            </h1>
            <PosThemePicker />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/pos/history')}
              className="text-sm text-slate-500 transition hover:text-slate-800 pos-dark:text-slate-400 pos-dark:hover:text-slate-200 pos-contrast:text-slate-300 pos-contrast:hover:text-white pos-emerald:text-slate-500 pos-emerald:hover:text-slate-800"
            >
              Historial de turnos
            </button>
            <button
              onClick={() => setCreatingRegister(true)}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 pos-dark:bg-indigo-500 pos-dark:hover:bg-indigo-400 pos-contrast:bg-amber-400 pos-contrast:text-black pos-contrast:hover:bg-amber-300 pos-emerald:bg-emerald-600 pos-emerald:hover:bg-emerald-500"
            >
              <Plus className="h-4 w-4" />
              Nueva caja
            </button>
          </div>
        </div>

        {dashboardQuery.data && <DailyPositionStrip position={dashboardQuery.data} />}

        {registersQuery.isLoading && <p className="text-sm text-slate-500 pos-dark:text-slate-400 pos-contrast:text-slate-300 pos-emerald:text-slate-500">Cargando cajas...</p>}
        {!registersQuery.isLoading && (registersQuery.data ?? []).length === 0 && (
          <p className="text-sm text-slate-500 pos-dark:text-slate-400 pos-contrast:text-slate-300 pos-emerald:text-slate-500">
            Todavía no hay ninguna caja creada - "Nueva caja" para dar de alta la primera.
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(registersQuery.data ?? []).map((register) => {
            const session = openSessionByRegister.get(register.id);
            return (
              <button
                key={register.id}
                onClick={() => handleCardClick(register.id)}
                className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-indigo-300 hover:shadow-md pos-dark:border-slate-700 pos-dark:bg-slate-900 pos-dark:hover:border-indigo-500 pos-contrast:border-slate-700 pos-contrast:bg-black pos-contrast:hover:border-amber-400 pos-emerald:border-emerald-100 pos-emerald:bg-white pos-emerald:hover:border-emerald-300"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-slate-900 pos-dark:text-slate-100 pos-contrast:text-white pos-emerald:text-slate-900">
                    {register.name}
                  </h2>
                  {session ? (
                    <Unlock className="h-4 w-4 text-green-600 pos-dark:text-green-400 pos-contrast:text-green-400 pos-emerald:text-green-600" />
                  ) : (
                    <Lock className="h-4 w-4 text-slate-400 pos-dark:text-slate-500 pos-contrast:text-slate-400 pos-emerald:text-slate-400" />
                  )}
                </div>
                <p className="text-xs text-slate-500 pos-dark:text-slate-400 pos-contrast:text-slate-300 pos-emerald:text-slate-500">
                  {register.branch.name}
                </p>
                {session ? (
                  <p className="text-xs text-green-700 pos-dark:text-green-400 pos-contrast:text-green-400 pos-emerald:text-green-700">
                    Turno abierto por {session.openedBy.name ?? session.openedBy.email} desde{' '}
                    {new Date(session.openedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                ) : (
                  <p className="text-xs text-slate-400 pos-dark:text-slate-500 pos-contrast:text-slate-400 pos-emerald:text-slate-400">
                    Sin turno abierto - tocá para abrir uno
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {openingRegisterId && (
        <OpenSessionModal
          registerId={openingRegisterId}
          onClose={() => setOpeningRegisterId(null)}
          onOpened={() => router.push(`/pos/sell?registerId=${openingRegisterId}`)}
        />
      )}

      {creatingRegister && <CreateRegisterModal onClose={() => setCreatingRegister(false)} />}
    </AppShell>
  );
}

/** Reporte consolidado multi-caja (Fase 2) - sólo lectura, sin navegación
 * nueva. Mismo criterio de color que /pos/history/CloseSessionModal:
 * diferencia 0 gris, positiva (sobrante) azul, negativa (faltante) roja. */
function DailyPositionStrip({ position }: { position: DailyPosition }) {
  const diff = Number(position.closedTodayDifferenceTotal);
  const diffColor =
    diff === 0
      ? 'text-slate-500 pos-dark:text-slate-400 pos-contrast:text-slate-300 pos-emerald:text-slate-500'
      : diff > 0
        ? 'text-blue-600 pos-dark:text-blue-400 pos-contrast:text-blue-400 pos-emerald:text-blue-600'
        : 'text-red-600 pos-dark:text-red-400 pos-contrast:text-red-400 pos-emerald:text-red-600';

  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm pos-dark:border-slate-700 pos-dark:bg-slate-900 pos-contrast:border-slate-700 pos-contrast:bg-black pos-emerald:border-emerald-100 pos-emerald:bg-white">
      <div>
        <span className="text-slate-500 pos-dark:text-slate-400 pos-contrast:text-slate-300 pos-emerald:text-slate-500">
          {position.openSessionsCount} caja{position.openSessionsCount === 1 ? '' : 's'} abierta
          {position.openSessionsCount === 1 ? '' : 's'} —{' '}
        </span>
        <span className="font-semibold text-slate-900 pos-dark:text-slate-100 pos-contrast:text-white pos-emerald:text-slate-900">
          ${Number(position.openSessionsExpectedTotal).toFixed(2)} esperado en total
        </span>
      </div>
      <div>
        <span className="text-slate-500 pos-dark:text-slate-400 pos-contrast:text-slate-300 pos-emerald:text-slate-500">
          ${Number(position.closedTodayCountedTotal).toFixed(2)} contado hoy ({position.closedTodayCount} turno
          {position.closedTodayCount === 1 ? '' : 's'} cerrado{position.closedTodayCount === 1 ? '' : 's'}) —{' '}
        </span>
        <span className={`font-semibold ${diffColor}`}>
          diferencia neta {diff === 0 ? 'exacta' : `${diff > 0 ? '+' : ''}$${diff.toFixed(2)}`}
        </span>
      </div>
    </div>
  );
}
