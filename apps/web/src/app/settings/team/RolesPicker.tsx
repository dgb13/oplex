'use client';

import { EXCLUSIVE_ROLES, formatRoles, ROLE_LABELS, type TeamRole } from '@/lib/team';
import { useState } from 'react';

// Qué habilita cada rol, en una línea (de apps/web/ayuda/introduccion/roles-y-permisos.md).
const ROLE_DESCRIPTIONS: Record<Exclude<TeamRole, 'OWNER'>, string> = {
  ADMIN: 'Maneja todo igual que el Dueño/a.',
  SALES: 'Clientes, cotizaciones, facturas, cobros y Caja.',
  PURCHASES: 'Proveedores, pedidos, órdenes y facturas de compra.',
  INVENTORY: 'Artículos, stock, recepciones y Producción.',
  ACCOUNTANT: 'Facturación, cobros, pagos y cheques.',
  VIEWER: 'Consulta todo lo que se le muestra, sin cargar nada.',
};

const COMBINABLE: TeamRole[] = ['SALES', 'PURCHASES', 'INVENTORY', 'ACCOUNTANT'];
// Dueño/a no se ofrece (igual que antes): se transfiere, no se asigna desde acá.
const ALONE: TeamRole[] = ['ADMIN', 'VIEWER'];
const ORDER: TeamRole[] = ['OWNER', 'ADMIN', 'SALES', 'PURCHASES', 'INVENTORY', 'ACCOUNTANT', 'VIEWER'];

export function sortRoles(roles: readonly TeamRole[]): TeamRole[] {
  return ORDER.filter((role) => roles.includes(role));
}

/**
 * Selector de varios roles (mockup aprobado 2026-10-30): los que se combinan
 * y los que van solos (Admin, Solo lectura - igual que normalizeRoles en la
 * API). Marcar uno que va solo desmarca el resto, y al revés, avisando qué
 * sacó. Abajo dice cómo va a quedar.
 */
export default function RolesPicker({
  value,
  onChange,
  idPrefix,
}: {
  value: TeamRole[];
  onChange: (roles: TeamRole[]) => void;
  idPrefix: string;
}) {
  const [notice, setNotice] = useState('');

  function toggle(role: TeamRole, checked: boolean) {
    let next: TeamRole[];
    let message = '';
    if (!checked) {
      next = value.filter((r) => r !== role);
    } else if (EXCLUSIVE_ROLES.includes(role)) {
      const dropped = value.filter((r) => r !== role);
      next = [role];
      if (dropped.length) message = `${ROLE_LABELS[role]} va solo: se sacaron ${formatRoles(dropped)}.`;
    } else {
      const alone = value.filter((r) => EXCLUSIVE_ROLES.includes(r));
      next = [...value.filter((r) => !EXCLUSIVE_ROLES.includes(r)), role];
      if (alone.length) message = `${formatRoles(alone)} va solo: se sacó para sumar ${ROLE_LABELS[role]}.`;
    }
    setNotice(message);
    onChange(sortRoles(next));
  }

  function row(role: TeamRole) {
    const id = `${idPrefix}-${role}`;
    const checked = value.includes(role);
    return (
      <label
        key={role}
        htmlFor={id}
        className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 transition ${
          checked ? 'border-primary bg-primary/10' : 'hover:bg-muted/50'
        }`}
      >
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => toggle(role, e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
        />
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {ROLE_LABELS[role]}
            {EXCLUSIVE_ROLES.includes(role) && (
              <span className="rounded-full border px-1.5 text-[11px] font-normal text-muted-foreground">va solo</span>
            )}
          </span>
          <span className="block text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[role as Exclude<TeamRole, 'OWNER'>]}</span>
        </span>
      </label>
    );
  }

  const warn = notice || (value.length === 0 ? 'Elegí al menos un rol.' : '');
  return (
    <div className="flex flex-col gap-1.5">
      <p className="mt-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Se pueden combinar</p>
      {COMBINABLE.map(row)}
      <p className="mt-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Van solos</p>
      {ALONE.map(row)}
      {warn ? (
        <p className="mt-1 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-300">{warn}</p>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">
          Va a quedar como: {value.map((r) => ROLE_LABELS[r]).join(' + ')}.
        </p>
      )}
    </div>
  );
}
