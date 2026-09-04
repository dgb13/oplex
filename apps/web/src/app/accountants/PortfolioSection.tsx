'use client';

import { startMembershipSession } from '@/lib/membership-session';
import {
  membershipsApi,
  TAX_DEADLINE_KIND_LABELS,
  type StudioMembershipSummary,
} from '@/lib/memberships';
import { profileApi } from '@/lib/profile';
import { teamApi } from '@/lib/team';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { extractErrorMessage, STATUS_COLORS, STATUS_LABELS } from './statusLabels';

const inputClass =
  'rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500';

function invalidateAll(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['membership-portfolio'] });
  void queryClient.invalidateQueries({ queryKey: ['membership-mine'] });
}

/** Lado "estudio": mi cartera de clientes ACCEPTED (con vencimientos), las
 * solicitudes pendientes que me llegaron/mandé, y el form para pedir acceso
 * a un cliente nuevo por email/CUIT - ver
 * docs/plan_modulo_contadores.txt, puntos 1/4/5. */
export default function PortfolioSection() {
  const queryClient = useQueryClient();
  const router = useRouter();

  const { data: profile } = useQuery({ queryKey: ['profile-me'], queryFn: profileApi.getMe });
  const canManage = profile?.role === 'OWNER' || profile?.role === 'ADMIN';
  // Sólo OWNER/ADMIN puede repartir cartera (GET /users es OWNER/ADMIN-only
  // en el backend) - y sólo tiene sentido mostrar contadores (ACCOUNTANT):
  // asignarle a un OWNER/ADMIN sería un no-op, ya ven todo sin importar la
  // asignación (ver filterVisibleForCaller).
  const { data: team } = useQuery({ queryKey: ['team-members'], queryFn: teamApi.list, enabled: canManage });
  const accountants = (team ?? []).filter((m) => m.role === 'ACCOUNTANT' && !m.isExternalAccountant);

  const { data: portfolio, isLoading: portfolioLoading } = useQuery({
    queryKey: ['membership-portfolio'],
    queryFn: membershipsApi.getPortfolio,
  });
  const { data: mine, isLoading: mineLoading } = useQuery({
    queryKey: ['membership-mine'],
    queryFn: membershipsApi.listMine,
  });

  const pending = (mine ?? []).filter((m) => m.status === 'PENDING');

  const activateMutation = useMutation({
    mutationFn: membershipsApi.activate,
    onSuccess: (result, membershipId) => {
      const client = portfolio?.find((p) => p.membershipId === membershipId);
      startMembershipSession(queryClient, router, result.accessToken, result.expiresAt, client?.clientTenantName ?? '');
    },
  });

  const respondMutation = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'ACCEPTED' | 'DECLINED' }) =>
      membershipsApi.respond(id, decision),
    onSuccess: () => invalidateAll(queryClient),
  });

  const cancelMutation = useMutation({
    mutationFn: membershipsApi.revoke,
    onSuccess: () => invalidateAll(queryClient),
  });

  const assignMutation = useMutation({
    mutationFn: ({ id, studioUserIds }: { id: string; studioUserIds: string[] }) =>
      membershipsApi.setAssignments(id, studioUserIds),
    onSuccess: () => invalidateAll(queryClient),
  });

  const [identifier, setIdentifier] = useState('');
  const [requestError, setRequestError] = useState('');
  const requestMutation = useMutation({
    mutationFn: membershipsApi.request,
    onSuccess: () => {
      setIdentifier('');
      setRequestError('');
      invalidateAll(queryClient);
    },
    onError: (err) => setRequestError(extractErrorMessage(err, 'No se pudo enviar la solicitud')),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4">
        <h2 className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-300">Pedir acceso a un cliente</h2>
        <p className="mb-3 text-xs text-slate-500">Por email o CUIT (11 dígitos) de una cuenta de Oplex existente.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setRequestError('');
            if (!identifier.trim()) return;
            requestMutation.mutate(identifier.trim());
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <input
            className={inputClass}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="cliente@empresa.com o 20-12345678-9"
          />
          <button
            type="submit"
            disabled={requestMutation.isPending}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
          >
            {requestMutation.isPending ? 'Enviando...' : 'Pedir acceso'}
          </button>
        </form>
        {requestError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{requestError}</p>}
      </div>

      {pending.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4">
          <h2 className="mb-3 text-sm font-medium text-slate-700 dark:text-slate-300">Solicitudes pendientes</h2>
          <div className="flex flex-col gap-2">
            {pending.map((m) => (
              <PendingRow
                key={m.id}
                membership={m}
                onRespond={(decision) => respondMutation.mutate({ id: m.id, decision })}
                onCancel={() => cancelMutation.mutate(m.id)}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-3 text-sm font-medium text-slate-700 dark:text-slate-300">Mi cartera</h2>
        {portfolioLoading || mineLoading ? (
          <p className="text-sm text-slate-500">Cargando...</p>
        ) : !portfolio || portfolio.length === 0 ? (
          <p className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6 text-sm text-slate-500">
            Todavía no tenés clientes activos. Pedí acceso arriba, o esperá a que un cliente te invite.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {portfolio.map((client) => {
              const assignedIds = mine?.find((m) => m.id === client.membershipId)?.assignedStudioUserIds ?? [];
              return (
                <div
                  key={client.membershipId}
                  className="flex flex-col gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4"
                >
                  <div>
                    <p className="font-medium text-slate-900 dark:text-slate-100">{client.clientTenantName}</p>
                    <p className="text-xs text-slate-500">{client.ownTaxCondition ?? 'Condición IVA sin cargar'}</p>
                  </div>
                  <p className="text-xs text-slate-500">{client.invoicesThisMonth} factura(s) este mes</p>
                  {client.upcomingDeadlines.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <p className="text-xs font-medium text-slate-500">Próximos vencimientos</p>
                      {client.upcomingDeadlines.map((d) => (
                        <p key={d.id} className="text-xs text-amber-600 dark:text-amber-400">
                          {TAX_DEADLINE_KIND_LABELS[d.kind as keyof typeof TAX_DEADLINE_KIND_LABELS] ?? d.kind} —{' '}
                          {new Date(d.dueDate).toLocaleDateString('es-AR', { timeZone: 'UTC' })} · {d.description}
                        </p>
                      ))}
                    </div>
                  )}
                  {canManage && accountants.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-slate-500">
                        Asignado a {assignedIds.length === 0 && '(todo el estudio)'}
                      </label>
                      <select
                        multiple
                        value={assignedIds}
                        onChange={(e) =>
                          assignMutation.mutate({
                            id: client.membershipId,
                            studioUserIds: Array.from(e.target.selectedOptions, (o) => o.value),
                          })
                        }
                        className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-2 py-1 text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500"
                        size={Math.min(accountants.length, 3)}
                      >
                        {accountants.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name ?? a.email}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <button
                    onClick={() => activateMutation.mutate(client.membershipId)}
                    disabled={activateMutation.isPending}
                    className="mt-auto rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {activateMutation.isPending ? 'Entrando...' : 'Entrar'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {activateMutation.isError && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">
            {extractErrorMessage(activateMutation.error, 'No se pudo entrar a este cliente')}
          </p>
        )}
      </div>
    </div>
  );
}

function PendingRow({
  membership,
  onRespond,
  onCancel,
}: {
  membership: StudioMembershipSummary;
  onRespond: (decision: 'ACCEPTED' | 'DECLINED') => void;
  onCancel: () => void;
}) {
  // Si la inicié yo (le pedí acceso a un cliente), me toca esperar - no hay
  // nada que responder de mi lado, pero sí puedo cancelarla. Sólo una
  // invitación que ME mandó el cliente (CLIENT_INVITED) es accionable con
  // Aceptar/Rechazar acá.
  const actionable = membership.direction === 'CLIENT_INVITED';

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2">
      <div>
        <p className="text-sm text-slate-800 dark:text-slate-200">{membership.clientTenantName}</p>
        <p className="text-xs text-slate-500">
          {actionable ? 'Te invitó como su estudio contable' : 'Esperando respuesta del cliente'}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[membership.status]}`}>
          {STATUS_LABELS[membership.status]}
        </span>
        {actionable ? (
          <>
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
          </>
        ) : (
          <button
            onClick={onCancel}
            className="rounded-lg border border-red-800 px-2 py-1 text-xs text-red-400 transition hover:bg-red-950"
          >
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}
