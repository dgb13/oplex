'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { companiesApi, type Company, type CompanyRoleType } from '@/lib/companies';
import { formatCuitInput } from '@/lib/cuit';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import AddContactsModal from './AddContactsModal';
import CompanyDetailModal from './CompanyDetailModal';
import CompanyFormModal, { ROLE_LABELS } from './CompanyFormModal';

const ROLE_FILTERS: { value: CompanyRoleType | ''; label: string }[] = [
  { value: '', label: 'Todas' },
  { value: 'CUSTOMER', label: 'Clientes' },
  { value: 'SUPPLIER', label: 'Proveedores' },
  { value: 'BRANCH', label: 'Sucursales' },
];

interface Props {
  /** Fixed role for a dedicated screen (/clients, /suppliers, "Mis
   * sucursales" en Preferencias) - the list only shows companies with this
   * role, and the create form locks to it (no roles checkbox). Omitted
   * only for /companies ("todas las empresas"), which shows every company
   * with a browsing-only role filter instead. */
  role?: CompanyRoleType;
  /** false makes this a read-only browsing view (/companies): no "+
   * Nuevo", detail modal opens without edit/deactivate/contacts actions
   * (still allows the narrow "Editar roles" action). */
  editable: boolean;
  title: string;
  newLabel?: string;
  /** 'card' renders as an embedded section matching the other Preferencias
   * cards (h2, bordered container) instead of a standalone page (h1). */
  variant?: 'page' | 'card';
  /** Tras crear una empresa nueva (no al editar), abre AddContactsModal para
   * esa empresa en vez de sólo cerrar el formulario - pensado para /suppliers
   * (y cualquier otra pantalla de rol único donde tenga sentido cargar
   * contactos de una), no para /companies ni "Mis sucursales" (una sucursal
   * no puede tener contactos, ver CompaniesService.createPerson). */
  promptContactsAfterCreate?: boolean;
  /** Opens CompanyFormModal immediately on mount instead of waiting for a
   * "+ Nuevo..." click - used to deep-link straight into the create form
   * (e.g. OnboardingChecklist's "Agregá tu primera sucursal" step), matching
   * what the user actually expects from that link instead of just landing
   * on the list. No effect when `editable` is false. */
  autoOpenNew?: boolean;
}

export default function CompanyListView({
  role,
  editable,
  title,
  newLabel,
  variant = 'page',
  promptContactsAfterCreate,
  autoOpenNew,
}: Props) {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<CompanyRoleType | ''>('');
  const [showInactive, setShowInactive] = useState(false);
  const [newOpen, setNewOpen] = useState(Boolean(autoOpenNew && editable));
  const [selected, setSelected] = useState<Company | null>(null);
  const [editing, setEditing] = useState<Company | null>(null);
  const [addingContactsTo, setAddingContactsTo] = useState<Company | null>(null);

  const effectiveRoleFilter = role ?? roleFilter;

  const companiesQuery = useQuery({
    queryKey: ['companies', effectiveRoleFilter || 'ALL', showInactive],
    queryFn: () => companiesApi.list(effectiveRoleFilter || undefined, showInactive),
  });

  const companies = companiesQuery.data ?? [];
  const normalizedSearch = search.trim().toLowerCase();
  const rows =
    normalizedSearch === ''
      ? companies
      : companies.filter(
          (c) =>
            c.name.toLowerCase().includes(normalizedSearch) ||
            (c.taxId ?? '').includes(normalizedSearch),
        );

  const heading = variant === 'card' ? (
    <h2 className="mb-1 text-sm font-medium text-muted-foreground">{title}</h2>
  ) : (
    <div>
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-1 text-xs text-muted-foreground">
        {rows.length} empresa{rows.length !== 1 ? 's' : ''}
      </p>
    </div>
  );

  const body = (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        {heading}
        {editable && <Button onClick={() => setNewOpen(true)}>{newLabel ?? '+ Nueva empresa'}</Button>}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o CUIT..."
          className="sm:max-w-sm"
        />
        <div className="flex items-center gap-2">
          {!role &&
            ROLE_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setRoleFilter(f.value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  roleFilter === f.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                {f.label}
              </button>
            ))}
          <label className="ml-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Mostrar inactivas
          </label>
        </div>
      </div>

      <div className={variant === 'card' ? '' : 'rounded-xl border bg-card p-4'}>
        {companiesQuery.isLoading ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            Cargando empresas...
          </div>
        ) : companiesQuery.error ? (
          <div className="flex h-40 items-center justify-center text-destructive">
            Error al cargar las empresas
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            Sin empresas que coincidan
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-4">Nombre</th>
                  <th className="pb-2 pr-4">Roles</th>
                  <th className="pb-2 pr-4">CUIT</th>
                  <th className="pb-2 pr-4">Email</th>
                  <th className="pb-2 pr-4 text-right">Crédito / PV</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => setSelected(c)}
                    className={`cursor-pointer border-b border-border/50 hover:bg-muted/40 ${!c.active ? 'opacity-50' : ''}`}
                  >
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        {c.logoUrl ? (
                          <img
                            src={c.logoUrl}
                            alt=""
                            className="h-6 w-6 shrink-0 rounded border object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : (
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted text-xs font-medium text-muted-foreground">
                            {c.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                        {c.name}
                      </div>
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex flex-wrap gap-1">
                        {c.roles.map((r) => (
                          <span
                            key={r.role}
                            className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                          >
                            {ROLE_LABELS[r.role] ?? r.role}
                          </span>
                        ))}
                        {!c.active && (
                          <Badge className="bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300">
                            Inactiva
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {c.taxId ? formatCuitInput(c.taxId) : '—'}
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">{c.email ?? '—'}</td>
                    <td className="py-2 pr-4 text-right">
                      {c.roles.some((r) => r.role === 'BRANCH')
                        ? (c.pointOfSaleNumber ?? '—')
                        : `$${Number(c.creditLimit).toFixed(2)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {newOpen && (
        <CompanyFormModal
          onClose={() => setNewOpen(false)}
          lockedRole={editable ? role : undefined}
          onSaved={promptContactsAfterCreate ? (saved) => setAddingContactsTo(saved) : undefined}
        />
      )}
      {addingContactsTo && (
        <AddContactsModal company={addingContactsTo} onClose={() => setAddingContactsTo(null)} />
      )}
      {selected && (
        <CompanyDetailModal
          company={selected}
          onClose={() => setSelected(null)}
          readOnly={!editable}
          onEdit={
            editable
              ? () => {
                  setEditing(selected);
                  setSelected(null);
                }
              : undefined
          }
        />
      )}
      {editing && (
        <CompanyFormModal company={editing} onClose={() => setEditing(null)} lockedRole={role} />
      )}
    </div>
  );

  if (variant === 'card') {
    return (
      <div className="rounded-xl border bg-card p-6">
        {body}
      </div>
    );
  }
  return body;
}
