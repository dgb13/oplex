'use client';

import { membershipsApi, type ClientMembershipSummary } from '@/lib/memberships';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { extractErrorMessage, STATUS_COLORS, STATUS_LABELS } from './statusLabels';

const inputClass =
  'rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500';

function invalidateAll(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['membership-as-client'] });
  void queryClient.invalidateQueries({ queryKey: ['membership-portfolio'] });
}

/** Lado "cliente": mis relaciones con estudios contables (los que invité,
 * los que me pidieron acceso), y el form para invitar uno nuevo por
 * email/CUIT - ver docs/plan_modulo_contadores.txt, punto 1. */
export default function ClientAccountantsSection() {
  const queryClient = useQueryClient();

  const { data: relations, isLoading } = useQuery({
    queryKey: ['membership-as-client'],
    queryFn: membershipsApi.listAsClient,
  });

  const respondMutation = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'ACCEPTED' | 'DECLINED' }) =>
      membershipsApi.respond(id, decision),
    onSuccess: () => invalidateAll(queryClient),
  });
  const revokeMutation = useMutation({
    mutationFn: membershipsApi.revoke,
    onSuccess: () => invalidateAll(queryClient),
  });

  const [identifier, setIdentifier] = useState('');
  const [inviteError, setInviteError] = useState('');
  const inviteMutation = useMutation({
    mutationFn: membershipsApi.invite,
    onSuccess: () => {
      setIdentifier('');
      setInviteError('');
      invalidateAll(queryClient);
    },
    onError: (err) => setInviteError(extractErrorMessage(err, 'No se pudo invitar a este estudio')),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4">
        <h2 className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-300">Invitar a un estudio contable</h2>
        <p className="mb-3 text-xs text-slate-500">Por email o CUIT (11 dígitos) de una cuenta de Oplex existente.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setInviteError('');
            if (!identifier.trim()) return;
            inviteMutation.mutate(identifier.trim());
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <input
            className={inputClass}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="estudio@contador.com o 20-12345678-9"
          />
          <button
            type="submit"
            disabled={inviteMutation.isPending}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
          >
            {inviteMutation.isPending ? 'Enviando...' : 'Invitar'}
          </button>
        </form>
        {inviteError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{inviteError}</p>}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-slate-700 dark:text-slate-300">Mis contadores</h2>
        {isLoading ? (
          <p className="text-sm text-slate-500">Cargando...</p>
        ) : !relations || relations.length === 0 ? (
          <p className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6 text-sm text-slate-500">
            Todavía no invitaste a ningún estudio contable.
          </p>
        ) : (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs text-slate-500">
                    <th className="p-3">Estudio</th>
                    <th className="p-3">Estado</th>
                    <th className="p-3">Origen</th>
                    <th className="p-3">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {relations.map((rel) => (
                    <RelationRow
                      key={rel.id}
                      relation={rel}
                      onRespond={(decision) => respondMutation.mutate({ id: rel.id, decision })}
                      onRevoke={() => revokeMutation.mutate(rel.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RelationRow({
  relation,
  onRespond,
  onRevoke,
}: {
  relation: ClientMembershipSummary;
  onRespond: (decision: 'ACCEPTED' | 'DECLINED') => void;
  onRevoke: () => void;
}) {
  // La invitación que YO mandé (CLIENT_INVITED) espera respuesta del
  // estudio - nada que hacer de mi lado todavía. Un pedido que el estudio
  // ME mandó (ACCOUNTANT_REQUESTED) sí es accionable acá.
  const actionable = relation.status === 'PENDING' && relation.direction === 'ACCOUNTANT_REQUESTED';

  return (
    <tr className="border-b border-slate-200/50 dark:border-slate-800/50">
      <td className="p-3 font-medium text-slate-800 dark:text-slate-200">{relation.homeTenantName}</td>
      <td className="p-3">
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[relation.status]}`}>
          {STATUS_LABELS[relation.status]}
        </span>
      </td>
      <td className="p-3 text-xs text-slate-500">
        {relation.direction === 'CLIENT_INVITED' ? 'Lo invité yo' : 'Me pidió acceso'}
      </td>
      <td className="p-3">
        {actionable ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => onRespond('ACCEPTED')}
              className="rounded-lg border border-green-800 px-2 py-1 text-xs text-green-400 transition hover:bg-green-950"
            >
              Aceptar
            </button>
            <button
              onClick={() => onRespond('DECLINED')}
              className="rounded-lg border border-red-800 px-2 py-1 text-xs text-red-400 transition hover:bg-red-950"
            >
              Rechazar
            </button>
          </div>
        ) : relation.status === 'ACCEPTED' ? (
          <button
            onClick={onRevoke}
            className="rounded-lg border border-red-800 px-2 py-1 text-xs text-red-400 transition hover:bg-red-950"
          >
            Revocar
          </button>
        ) : (
          <span className="text-xs text-slate-500">—</span>
        )}
      </td>
    </tr>
  );
}
