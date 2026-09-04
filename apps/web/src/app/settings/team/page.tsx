'use client';

import { profileApi } from '@/lib/profile';
import { ROLE_LABELS, teamApi, type TeamMember, type TeamMemberStatus, type TeamRole } from '@/lib/team';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';
import ToggleSwitch from '@/components/ToggleSwitch';
import InviteMemberModal from './InviteMemberModal';
import UserActivityDrawer from './UserActivityDrawer';

// Misma extracción que CompanyFormModal/admin/page.tsx - sin esto, un
// PATCH/POST fallido no deja ningún rastro de qué salió mal.
function extractErrorMessage(err: unknown, fallback: string): string {
  const message = (err as AxiosError<{ message?: string | string[] }> | undefined)?.response?.data?.message;
  if (!message) return fallback;
  return Array.isArray(message) ? message.join(', ') : message;
}

const ROLE_BADGE_CLASSES: Record<TeamRole, string> = {
  OWNER: 'bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300',
  ADMIN: 'bg-violet-100 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300',
  SALES: 'bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300',
  PURCHASES: 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300',
  INVENTORY: 'bg-teal-100 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300',
  ACCOUNTANT: 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300',
  VIEWER: 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400',
};

const ASSIGNABLE_ROLES: TeamRole[] = ['ADMIN', 'SALES', 'PURCHASES', 'INVENTORY', 'ACCOUNTANT', 'VIEWER'];

export default function TeamPage() {
  const { data: profile } = useQuery({ queryKey: ['profile-me'], queryFn: profileApi.getMe });
  const { data: members, isLoading } = useQuery({ queryKey: ['team-members'], queryFn: teamApi.list });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [activityMember, setActivityMember] = useState<TeamMember | null>(null);

  const canManage = profile?.role === 'OWNER' || profile?.role === 'ADMIN';

  if (profile && !canManage) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Equipo</h1>
        <p className="text-sm text-slate-500">No tenés permiso para ver esta sección.</p>
      </div>
    );
  }

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Equipo</h1>
          <p className="text-sm text-slate-500">Quién tiene acceso a esta cuenta, con qué rol y qué tan activo está.</p>
        </div>
        <button
          type="button"
          onClick={() => setInviteOpen(true)}
          className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          + Invitar / Agregar colaborador
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900">
        {isLoading ? (
          <p className="p-6 text-sm text-slate-500">Cargando equipo...</p>
        ) : !members || members.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">Todavía no hay nadie más en el equipo.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                  <th className="p-3">Miembro</th>
                  <th className="p-3">Rol</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3">Desde</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    isSelf={member.id === profile?.id}
                    onViewActivity={() => setActivityMember(member)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {inviteOpen && <InviteMemberModal onClose={() => setInviteOpen(false)} />}
      {activityMember && <UserActivityDrawer member={activityMember} onClose={() => setActivityMember(null)} />}
    </div>
  );
}

function MemberRow({
  member,
  isSelf,
  onViewActivity,
}: {
  member: TeamMember;
  isSelf: boolean;
  onViewActivity: () => void;
}) {
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<{ text: string; isError: boolean } | null>(null);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['team-members'] });
  }

  const roleMutation = useMutation({
    mutationFn: (role: TeamRole) => teamApi.changeRole(member.id, role),
    onSuccess: () => {
      setFeedback(null);
      invalidate();
    },
    onError: (err) => setFeedback({ text: extractErrorMessage(err, 'No se pudo cambiar el rol'), isError: true }),
  });

  const statusMutation = useMutation({
    mutationFn: (status: TeamMemberStatus) => teamApi.toggleStatus(member.id, status),
    onSuccess: () => {
      setFeedback(null);
      invalidate();
    },
    onError: (err) => setFeedback({ text: extractErrorMessage(err, 'No se pudo aplicar el cambio'), isError: true }),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: () => teamApi.resetPassword(member.id),
    onSuccess: () => setFeedback({ text: 'Se envió el link para elegir una contraseña nueva', isError: false }),
    onError: (err) => setFeedback({ text: extractErrorMessage(err, 'No se pudo enviar el reseteo'), isError: true }),
  });

  return (
    <tr className="border-b border-slate-200/70 dark:border-slate-800/70 last:border-0">
      <td className="p-3">
        <div className="font-medium text-slate-900 dark:text-slate-100">
          {member.name ?? member.email}
          {isSelf && <span className="ml-2 text-xs font-normal text-slate-500">(vos)</span>}
        </div>
        <div className="text-xs text-slate-500">{member.email}</div>
        {feedback && (
          <div className={`mt-1 text-xs ${feedback.isError ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
            {feedback.text}
          </div>
        )}
      </td>
      <td className="p-3">
        {member.isExternalAccountant ? (
          <span
            className="rounded-full bg-indigo-100 dark:bg-indigo-950/50 px-2.5 py-1 text-xs font-medium text-indigo-700 dark:text-indigo-300"
            title="Fila espejo de un contador externo - gestioná el acceso desde Contadores, no acá"
          >
            Contador externo
          </span>
        ) : member.role === 'OWNER' ? (
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${ROLE_BADGE_CLASSES.OWNER}`}>
            {ROLE_LABELS.OWNER}
          </span>
        ) : (
          <select
            value={member.role}
            onChange={(e) => roleMutation.mutate(e.target.value as TeamRole)}
            disabled={roleMutation.isPending}
            className={`rounded-full border-0 px-2.5 py-1 text-xs font-medium outline-none disabled:opacity-50 ${ROLE_BADGE_CLASSES[member.role]}`}
          >
            {ASSIGNABLE_ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        )}
      </td>
      <td className="p-3">
        {member.isExternalAccountant ? (
          <span className="text-xs text-slate-500">{member.status === 'ACTIVE' ? 'Activo' : 'Suspendido'}</span>
        ) : (
          <div className="flex items-center gap-2" title={isSelf ? 'No podés suspender tu propia cuenta' : undefined}>
            <ToggleSwitch
              checked={member.status === 'ACTIVE'}
              onChange={(checked) => statusMutation.mutate(checked ? 'ACTIVE' : 'SUSPENDED')}
              label={member.status === 'ACTIVE' ? 'Activo' : 'Suspendido'}
            />
            <span className="text-xs text-slate-500">{member.status === 'ACTIVE' ? 'Activo' : 'Suspendido'}</span>
          </div>
        )}
      </td>
      <td className="p-3 text-xs text-slate-500">{new Date(member.createdAt).toLocaleDateString('es-AR')}</td>
      <td className="p-3 text-right">
        <Menu as="div" className="relative inline-block text-left">
          <MenuButton className="rounded-lg px-2 py-1 text-slate-500 transition hover:bg-slate-200 dark:hover:bg-slate-800">
            ⋯
          </MenuButton>
          <MenuItems
            anchor="bottom end"
            className="z-10 mt-1 w-52 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-1 text-sm shadow-xl focus:outline-none"
          >
            <MenuItem>
              <button
                type="button"
                onClick={onViewActivity}
                className="block w-full px-3 py-2 text-left text-slate-700 dark:text-slate-300 data-[focus]:bg-slate-100 dark:data-[focus]:bg-slate-800"
              >
                Ver actividad
              </button>
            </MenuItem>
            {!member.isExternalAccountant && (
              <MenuItem>
                <button
                  type="button"
                  onClick={() => resetPasswordMutation.mutate()}
                  disabled={resetPasswordMutation.isPending}
                  className="block w-full px-3 py-2 text-left text-slate-700 dark:text-slate-300 data-[focus]:bg-slate-100 dark:data-[focus]:bg-slate-800 disabled:opacity-50"
                >
                  {resetPasswordMutation.isPending ? 'Enviando...' : 'Resetear contraseña'}
                </button>
              </MenuItem>
            )}
          </MenuItems>
        </Menu>
      </td>
    </tr>
  );
}
