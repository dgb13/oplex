'use client';

import { Button } from '@/components/ui/button';
import type { TeamMember, TeamRole } from '@/lib/team';
import { useState } from 'react';
import RolesPicker from './RolesPicker';

/** Editar los roles de una persona del equipo (mockup aprobado 2026-10-30).
 * Guarda con onSave; el cambio aplica en el momento (la API relee los roles
 * en cada pedido, ver CurrentUserRolesService). */
export default function EditRolesModal({
  member,
  isPending,
  error,
  onSave,
  onClose,
}: {
  member: TeamMember;
  isPending: boolean;
  error: string | null;
  onSave: (roles: TeamRole[]) => void;
  onClose: () => void;
}) {
  const [roles, setRoles] = useState<TeamRole[]>(member.roles);
  const firstName = (member.name ?? member.email).split(' ')[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-roles-title"
        className="max-h-full w-full max-w-md overflow-y-auto rounded-xl border bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 id="edit-roles-title" className="text-lg font-semibold">
            Roles de {firstName}
          </h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-muted-foreground transition hover:text-foreground">
            ✕
          </button>
        </div>
        <p className="mb-3 text-sm text-muted-foreground">
          Marcá uno o más. Puede todo lo que permita cualquiera de los roles marcados.
        </p>

        <RolesPicker value={roles} onChange={setRoles} idPrefix={`edit-role-${member.id}`} />

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        <div className="mt-4 flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" disabled={isPending || roles.length === 0} onClick={() => onSave(roles)}>
            {isPending ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      </div>
    </div>
  );
}
