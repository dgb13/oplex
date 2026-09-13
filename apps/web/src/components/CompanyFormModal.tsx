'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { companiesApi, type Company, type CompanyIndustry, type CompanyRoleType } from '@/lib/companies';
import { formatCuitInput, normalizeCuit } from '@/lib/cuit';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  company?: Company;
  onClose: () => void;
  /** Called with the created/updated company right after a successful
   * save, in addition to the normal invalidate+onClose - so a caller that
   * opened this inline (e.g. to create a customer/branch without leaving
   * another form) can auto-select the result. */
  onSaved?: (company: Company) => void;
  /** Dedicated single-role surface (/clients, /suppliers, "Mis sucursales"
   * en Preferencias): hides the roles checkbox entirely and only shows the
   * fields relevant to that role. On create, the new company gets exactly
   * this one role. On edit, `roles` is NOT sent in the update payload at
   * all - UpdateCompanyDto.roles REPLACES the company's full role set
   * rather than merging, so a company that also holds another role (e.g.
   * a distributor that's both CUSTOMER and SUPPLIER) must keep it even
   * when edited from a role-locked screen. */
  lockedRole?: CompanyRoleType;
  /** CUIT duplicate detection (only runs when lockedRole + creating new)
   * found a company that already exists under a different role and the
   * user chose to merge instead of creating a duplicate. */
  onMerged?: (company: Company) => void;
}

const selectClass =
  'h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

const ROLE_OPTIONS: { value: CompanyRoleType; label: string }[] = [
  { value: 'CUSTOMER', label: 'Cliente' },
  { value: 'SUPPLIER', label: 'Proveedor' },
  { value: 'BRANCH', label: 'Sucursal / punto de venta propio' },
];

export const ROLE_LABELS: Record<CompanyRoleType, string> = {
  CUSTOMER: 'Cliente',
  SUPPLIER: 'Proveedor',
  BRANCH: 'Sucursal',
};

const INDUSTRY_OPTIONS: { value: CompanyIndustry; label: string }[] = [
  { value: 'COMERCIO', label: 'Comercio' },
  { value: 'SERVICIOS', label: 'Servicios' },
  { value: 'INDUSTRIA', label: 'Industria' },
  { value: 'CONSTRUCCION', label: 'Construcción' },
  { value: 'AGRO', label: 'Agro' },
  { value: 'TECNOLOGIA', label: 'Tecnología' },
  { value: 'SALUD', label: 'Salud' },
  { value: 'EDUCACION', label: 'Educación' },
  { value: 'GASTRONOMIA', label: 'Gastronomía' },
  { value: 'TRANSPORTE', label: 'Transporte' },
  { value: 'INMOBILIARIO', label: 'Inmobiliario' },
  { value: 'OTRO', label: 'Otro' },
];

export default function CompanyFormModal({
  company,
  onClose,
  onSaved,
  lockedRole,
  onMerged,
}: Props) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(company);

  const [name, setName] = useState(company?.name ?? '');
  const [taxId, setTaxId] = useState(company?.taxId ?? '');
  const [email, setEmail] = useState(company?.email ?? '');
  const [creditLimit, setCreditLimit] = useState(company?.creditLimit ?? '0');
  const [pointOfSaleNumber, setPointOfSaleNumber] = useState(company?.pointOfSaleNumber ?? '');
  const [taxCondition, setTaxCondition] = useState(company?.taxCondition ?? '');
  const [fiscalAddress, setFiscalAddress] = useState(company?.fiscalAddress ?? '');
  const [industry, setIndustry] = useState<CompanyIndustry | ''>(company?.industry ?? '');
  const [grossIncomeNumber, setGrossIncomeNumber] = useState(company?.grossIncomeNumber ?? '');
  const [withholdsVat, setWithholdsVat] = useState(company?.withholdsVat ?? false);
  const [withholdsIncomeTax, setWithholdsIncomeTax] = useState(company?.withholdsIncomeTax ?? false);
  const [withholdsGrossIncome, setWithholdsGrossIncome] = useState(
    company?.withholdsGrossIncome ?? false,
  );
  const [logoUrl, setLogoUrl] = useState(company?.logoUrl ?? '');
  const [roles, setRoles] = useState<CompanyRoleType[]>(
    company?.roles.map((r) => r.role) ?? ['CUSTOMER'],
  );
  const [error, setError] = useState('');
  const [afipMessage, setAfipMessage] = useState('');
  const [afipError, setAfipError] = useState('');
  // Set only when the CUIT-collision check (create + lockedRole only)
  // finds an existing company under a different role - offers merging the
  // new role into it instead of creating a duplicate row.
  const [mergeCandidate, setMergeCandidate] = useState<Company | null>(null);

  const effectiveRoles = lockedRole ? [lockedRole] : roles;

  const afipLookup = useMutation({
    mutationFn: () => companiesApi.lookupAfip(taxId),
    onSuccess: (data) => {
      setName(data.name);
      setTaxCondition(data.taxCondition ?? '');
      setFiscalAddress(data.fiscalAddress ?? '');
      setAfipError('');
      setAfipMessage('Datos encontrados en AFIP');
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      setAfipMessage('');
      const message = err.response?.data?.message ?? 'No se pudo consultar AFIP';
      setAfipError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  const mutation = useMutation({
    mutationFn: () => {
      const base = {
        name,
        taxId: taxId || undefined,
        email: email || undefined,
        creditLimit: Number(creditLimit),
        pointOfSaleNumber: effectiveRoles.includes('BRANCH') ? pointOfSaleNumber || undefined : undefined,
        taxCondition: taxCondition || undefined,
        fiscalAddress: fiscalAddress || undefined,
        industry: industry || undefined,
        grossIncomeNumber: grossIncomeNumber || undefined,
        withholdsVat: effectiveRoles.includes('CUSTOMER') ? withholdsVat : undefined,
        withholdsIncomeTax: effectiveRoles.includes('CUSTOMER') ? withholdsIncomeTax : undefined,
        withholdsGrossIncome: effectiveRoles.includes('CUSTOMER') ? withholdsGrossIncome : undefined,
        logoUrl: logoUrl || undefined,
      };
      if (company) {
        return companiesApi.update(company.id, {
          ...base,
          ...(lockedRole ? {} : { roles }),
        });
      }
      return companiesApi.create({ ...base, roles: lockedRole ? [lockedRole] : roles });
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['companies'] });
      onSaved?.(saved);
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo guardar la empresa';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  const mergeMutation = useMutation({
    mutationFn: () => {
      if (!mergeCandidate || !lockedRole) throw new Error('Nada para fusionar');
      const existingRoles = mergeCandidate.roles.map((r) => r.role);
      return companiesApi.update(mergeCandidate.id, {
        roles: existingRoles.includes(lockedRole) ? existingRoles : [...existingRoles, lockedRole],
      });
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['companies'] });
      onMerged?.(saved);
      onSaved?.(saved);
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo agregar el rol';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  const collisionCheck = useMutation({
    mutationFn: async () => {
      const all = await companiesApi.list(undefined, true);
      const normalized = normalizeCuit(taxId);
      return all.find((c) => c.taxId && normalizeCuit(c.taxId) === normalized) ?? null;
    },
    onSuccess: (existing) => {
      if (!existing) {
        mutation.mutate();
        return;
      }
      if (lockedRole && existing.roles.some((r) => r.role === lockedRole)) {
        setError(`Ya existe un/a ${ROLE_LABELS[lockedRole].toLowerCase()} con este CUIT: ${existing.name}.`);
        return;
      }
      setMergeCandidate(existing);
    },
  });

  function toggleRole(role: CompanyRoleType) {
    setRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMergeCandidate(null);
    if (!name.trim()) {
      setError('El nombre es obligatorio');
      return;
    }
    if (!lockedRole && roles.length === 0) {
      setError('Elegí al menos un rol');
      return;
    }
    if (effectiveRoles.includes('BRANCH') && !pointOfSaleNumber.trim()) {
      setError('Una sucursal necesita un número de punto de venta');
      return;
    }
    // Duplicate-CUIT detection only applies to a brand-new, role-locked
    // company - the generic multi-role form (no lockedRole) still allows
    // picking multiple roles up front, so there's nothing to "merge" there.
    if (!isEdit && lockedRole && taxId.trim()) {
      collisionCheck.mutate();
      return;
    }
    mutation.mutate();
  }

  const roleLabel = lockedRole ? ROLE_LABELS[lockedRole] : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl rounded-xl border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {isEdit ? `Editar ${roleLabel ? roleLabel.toLowerCase() : 'empresa'}` : roleLabel ? `Nuevo/a ${roleLabel.toLowerCase()}` : 'Nueva empresa'}
          </h2>
          <button onClick={onClose} className="text-muted-foreground transition hover:text-foreground">
            ✕
          </button>
        </div>

        {mergeCandidate ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm">
              Ya existe <strong>{mergeCandidate.name}</strong> con este CUIT, con el rol
              {mergeCandidate.roles.length > 1 ? 'es' : ''}{' '}
              {mergeCandidate.roles.map((r) => ROLE_LABELS[r.role]).join(', ')}.
              ¿Agregarle el rol {roleLabel} en vez de crear una empresa nueva?
            </p>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-3">
              <Button type="button" variant="ghost" onClick={() => setMergeCandidate(null)}>
                Cancelar
              </Button>
              <Button type="button" onClick={() => mergeMutation.mutate()} disabled={mergeMutation.isPending}>
                {mergeMutation.isPending ? 'Agregando...' : `Agregar rol ${roleLabel}`}
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Field label="CUIT / Tax ID">
              <div className="flex gap-2">
                <Input
                  value={taxId}
                  onChange={(e) => setTaxId(formatCuitInput(e.target.value))}
                  placeholder="30-71659554-9"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => afipLookup.mutate()}
                  disabled={afipLookup.isPending || !taxId.trim()}
                >
                  {afipLookup.isPending ? 'Consultando AFIP...' : 'Buscar en AFIP'}
                </Button>
              </div>
              {afipMessage && <p className="text-xs text-muted-foreground">{afipMessage}</p>}
              {afipError && <p className="text-xs text-destructive">{afipError}</p>}
              {(taxCondition || fiscalAddress) && (
                <p className="text-xs text-muted-foreground">
                  {[taxCondition, fiscalAddress].filter(Boolean).join(' · ')}
                </p>
              )}
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Nombre / Razón Social">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Se completa solo al buscar el CUIT en AFIP"
                />
              </Field>
              <Field label="Email">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Rubro">
                <select
                  className={`${selectClass} w-full`}
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value as CompanyIndustry | '')}
                >
                  <option value="">Sin especificar</option>
                  {INDUSTRY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Ingresos Brutos (IIBB)">
                <Input value={grossIncomeNumber} onChange={(e) => setGrossIncomeNumber(e.target.value)} />
              </Field>
            </div>

            <div className="grid grid-cols-4 gap-4">
              <div className={effectiveRoles.includes('CUSTOMER') ? 'col-span-3' : 'col-span-4'}>
                <Field label="Logo (URL)">
                  <div className="flex items-center gap-3">
                    {logoUrl && (
                      <img
                        src={logoUrl}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded-lg border object-cover"
                        onError={(e) => {
                          e.currentTarget.style.visibility = 'hidden';
                        }}
                      />
                    )}
                    <Input
                      className="flex-1"
                      value={logoUrl}
                      onChange={(e) => setLogoUrl(e.target.value)}
                      placeholder="https://..."
                    />
                  </div>
                </Field>
              </div>
              {effectiveRoles.includes('CUSTOMER') && (
                <div className="col-span-1">
                  <Field label="Límite de crédito">
                    <Input
                      type="number"
                      step="any"
                      value={creditLimit}
                      onChange={(e) => setCreditLimit(e.target.value)}
                    />
                  </Field>
                </div>
              )}
            </div>

            {!lockedRole && (
              <Field label="Roles">
                <div className="flex flex-col gap-2 rounded-lg border bg-muted p-3">
                  {ROLE_OPTIONS.map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={roles.includes(opt.value)}
                        onChange={() => toggleRole(opt.value)}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </Field>
            )}

            {effectiveRoles.includes('CUSTOMER') && (
              <Field label="Retenciones (agente AFIP/ARBA)">
                <div className="flex flex-col gap-2 rounded-lg border bg-muted p-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={withholdsVat}
                      onChange={(e) => setWithholdsVat(e.target.checked)}
                    />
                    Retiene IVA
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={withholdsIncomeTax}
                      onChange={(e) => setWithholdsIncomeTax(e.target.checked)}
                    />
                    Retiene Ganancias
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={withholdsGrossIncome}
                      onChange={(e) => setWithholdsGrossIncome(e.target.checked)}
                    />
                    Retiene Ingresos Brutos
                  </label>
                </div>
              </Field>
            )}

            {effectiveRoles.includes('BRANCH') && (
              <Field label="Punto de venta (AFIP)">
                <Input
                  value={pointOfSaleNumber}
                  onChange={(e) => setPointOfSaleNumber(e.target.value)}
                  placeholder="0001"
                />
              </Field>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={mutation.isPending || collisionCheck.isPending}>
                {mutation.isPending || collisionCheck.isPending
                  ? 'Guardando...'
                  : isEdit
                    ? 'Guardar cambios'
                    : roleLabel
                      ? `Crear ${roleLabel.toLowerCase()}`
                      : 'Crear empresa'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
