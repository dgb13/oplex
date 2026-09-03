'use client';

import AppShell from '@/components/AppShell';
import { posApi } from '@/lib/pos';
import { useQuery } from '@tanstack/react-query';
import { Lock, Plus, Unlock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import CreateRegisterModal from './CreateRegisterModal';
import OpenSessionModal from './OpenSessionModal';

export default function PosSelectorPage() {
  const router = useRouter();
  const [openingRegisterId, setOpeningRegisterId] = useState<string | null>(null);
  const [creatingRegister, setCreatingRegister] = useState(false);

  const registersQuery = useQuery({ queryKey: ['pos-registers'], queryFn: posApi.listRegisters });
  const openSessionsQuery = useQuery({ queryKey: ['pos-open-sessions'], queryFn: posApi.listOpenSessions });

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
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-slate-900">Caja</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/pos/history')}
              className="text-sm text-slate-500 transition hover:text-slate-800"
            >
              Historial de turnos
            </button>
            <button
              onClick={() => setCreatingRegister(true)}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
            >
              <Plus className="h-4 w-4" />
              Nueva caja
            </button>
          </div>
        </div>

        {registersQuery.isLoading && <p className="text-sm text-slate-500">Cargando cajas...</p>}
        {!registersQuery.isLoading && (registersQuery.data ?? []).length === 0 && (
          <p className="text-sm text-slate-500">
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
                className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-indigo-300 hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-slate-900">{register.name}</h2>
                  {session ? (
                    <Unlock className="h-4 w-4 text-green-600" />
                  ) : (
                    <Lock className="h-4 w-4 text-slate-400" />
                  )}
                </div>
                <p className="text-xs text-slate-500">{register.branch.name}</p>
                {session ? (
                  <p className="text-xs text-green-700">
                    Turno abierto por {session.openedBy.name ?? session.openedBy.email} desde{' '}
                    {new Date(session.openedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                ) : (
                  <p className="text-xs text-slate-400">Sin turno abierto - tocá para abrir uno</p>
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
