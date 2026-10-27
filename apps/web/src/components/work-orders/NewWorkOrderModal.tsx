'use client';

import CompanyFormModal from '@/components/CompanyFormModal';
import AssetFormModal from '@/components/customer-assets/AssetFormModal';
import CustomerPicker from '@/components/sales/CustomerPicker';
import { LinkButton } from '@/components/sales/SalesDocumentSheet';
import { useCompanyPermissions } from '@/components/useCompanyPermissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Select from '@/components/ui/Select';
import { Textarea } from '@/components/ui/textarea';
import { businessProfileApi, isModuleEnabled } from '@/lib/businessModules';
import { companiesApi } from '@/lib/companies';
import { assetSummary, customerAssetsApi } from '@/lib/customerAssets';
import { workOrdersApi, type WorkOrderDetail } from '@/lib/workOrders';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  docName: string;
  /** Desde la ficha de un vehículo: cliente y vehículo vienen elegidos. */
  defaultCustomerId?: string;
  defaultAssetId?: string;
  onClose: () => void;
  onCreated?: (order: WorkOrderDetail) => void;
}

/** Alta de una orden de trabajo: cliente, su vehículo/equipo, los datos del
 * día (km), qué pidió y cómo vino. */
export default function NewWorkOrderModal({ docName, defaultCustomerId, defaultAssetId, onClose, onCreated }: Props) {
  const queryClient = useQueryClient();
  const [customerId, setCustomerId] = useState(defaultCustomerId ?? '');
  const [assetId, setAssetId] = useState(defaultAssetId ?? '');
  const [intakeValues, setIntakeValues] = useState<Record<string, string>>({});
  const [description, setDescription] = useState('');
  const [intakeNotes, setIntakeNotes] = useState('');
  const [assignedUserId, setAssignedUserId] = useState('');
  const [promisedAt, setPromisedAt] = useState('');
  const [creatingAsset, setCreatingAsset] = useState(false);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const perms = useCompanyPermissions();
  const [error, setError] = useState('');

  const { data: business } = useQuery({ queryKey: ['business-profile'], queryFn: businessProfileApi.get });
  const fichasOn = Boolean(business) && isModuleEnabled(business, 'fichas');
  const customersQuery = useQuery({
    queryKey: ['companies', 'CUSTOMER'],
    queryFn: () => companiesApi.list('CUSTOMER'),
    enabled: !defaultCustomerId,
  });
  const typesQuery = useQuery({ queryKey: ['customer-asset-types'], queryFn: customerAssetsApi.listTypes, enabled: fichasOn });
  const assetsQuery = useQuery({
    queryKey: ['customer-assets', 'company', customerId],
    queryFn: () => customerAssetsApi.list({ companyId: customerId }),
    enabled: fichasOn && Boolean(customerId),
  });
  const assigneesQuery = useQuery({ queryKey: ['work-order-assignees'], queryFn: workOrdersApi.assignees });

  const types = typesQuery.data ?? [];
  const assets = assetsQuery.data ?? [];
  const asset = assets.find((a) => a.id === assetId);
  const assetType = types.find((t) => t.id === asset?.typeId);
  // Datos que cambian en cada visita: los numéricos de la ficha (los km).
  const intakeFields = (assetType?.fields ?? []).filter((f) => f.type === 'NUMBER' && !f.hidden);

  const mutation = useMutation({
    mutationFn: () => {
      const assetValues: Record<string, number> = {};
      for (const f of intakeFields) {
        const raw = intakeValues[f.key];
        if (raw !== undefined && raw.trim() !== '') assetValues[f.key] = Number(raw);
      }
      return workOrdersApi.create({
        customerId,
        assetId: assetId || undefined,
        description: description.trim(),
        intakeNotes: intakeNotes.trim() || undefined,
        assetValues: Object.keys(assetValues).length > 0 ? assetValues : undefined,
        assignedUserId: assignedUserId || undefined,
        promisedAt: promisedAt || undefined,
      });
    },
    onSuccess: (order) => {
      void queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['customer-asset', order.asset?.id] });
      onCreated?.(order);
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo crear';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!customerId) return setError('Elegí el cliente');
    if (description.trim().length < 2) return setError('Escribí qué hay que hacer');
    mutation.mutate();
  }

  const assetLabel = types.length === 1 ? types[0].name : 'Ficha';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <form onSubmit={submit} className="flex max-h-[90vh] w-full max-w-xl flex-col gap-4 overflow-y-auto rounded-xl border bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Cargar {docName.toLowerCase()}</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-muted-foreground hover:text-foreground">
            ✕
          </button>
        </div>

        {!defaultCustomerId && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">Cliente</span>
              {perms.can('CUSTOMER') && (
                <LinkButton onClick={() => setCreatingCustomer(true)}>+ Nuevo cliente</LinkButton>
              )}
            </div>
            <CustomerPicker
              customers={customersQuery.data ?? []}
              value={customerId}
              onChange={(id) => {
                setCustomerId(id);
                setAssetId('');
                setIntakeValues({});
              }}
              autoFocus
            />
          </div>
        )}

        {fichasOn && types.length > 0 && customerId && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{assetLabel}</span>
              {!defaultAssetId && (
                <button type="button" onClick={() => setCreatingAsset(true)} className="text-xs font-medium text-indigo-600 hover:underline">
                  + Cargar {assetLabel.toLowerCase()}
                </button>
              )}
            </div>
            <Select
              value={assetId}
              onChange={(id) => {
                setAssetId(id);
                setIntakeValues({});
              }}
              disabled={Boolean(defaultAssetId)}
              options={[
                { value: '', label: assets.length === 0 ? `Todavía no tiene ${(types.length === 1 ? types[0].pluralName : 'fichas').toLowerCase()}` : 'Sin elegir' },
                ...assets.map((a) => ({
                  value: a.id,
                  label: [a.identifier, assetSummary(types.find((t) => t.id === a.typeId), a, 2)].filter(Boolean).join(' · '),
                })),
              ]}
            />
          </div>
        )}

        {asset && intakeFields.length > 0 && (
          <div className="grid grid-cols-1 gap-3 rounded-lg bg-muted/40 p-3 sm:grid-cols-2">
            <p className="text-xs text-muted-foreground sm:col-span-2">Al ingresar (se actualiza en la ficha)</p>
            {intakeFields.map((f) => (
              <div key={f.key} className="flex flex-col gap-1">
                <label htmlFor={`intake-${f.key}`} className="text-sm text-muted-foreground">
                  {f.label}
                </label>
                <Input
                  id={`intake-${f.key}`}
                  type="number"
                  inputMode="decimal"
                  step="any"
                  placeholder={asset.values[f.key] !== undefined ? `Antes: ${asset.values[f.key]}` : undefined}
                  value={intakeValues[f.key] ?? ''}
                  onChange={(e) => setIntakeValues((v) => ({ ...v, [f.key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="wo-description" className="text-sm text-muted-foreground">
            ¿Qué hay que hacer? *
          </label>
          <Textarea
            id="wo-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Ej.: lo que pidió el cliente y lo que hay que revisar"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="wo-intake" className="text-sm text-muted-foreground">
            Cómo vino (opcional)
          </label>
          <Textarea
            id="wo-intake"
            value={intakeNotes}
            onChange={(e) => setIntakeNotes(e.target.value)}
            rows={2}
            placeholder="Rayones, objetos que dejó, accesorios entregados…"
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">Responsable</span>
            <Select
              value={assignedUserId}
              onChange={setAssignedUserId}
              options={[{ value: '', label: 'Sin asignar' }, ...(assigneesQuery.data ?? []).map((u) => ({ value: u.id, label: u.name }))]}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="wo-promised" className="text-sm text-muted-foreground">
              Prometido para
            </label>
            <Input id="wo-promised" type="date" value={promisedAt} onChange={(e) => setPromisedAt(e.target.value)} />
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Creando…' : `Crear ${docName.toLowerCase()}`}
          </Button>
        </div>
      </form>
      {creatingAsset && (
        <AssetFormModal
          types={types}
          companyId={customerId}
          onClose={() => setCreatingAsset(false)}
          onSaved={(saved) => {
            void queryClient.invalidateQueries({ queryKey: ['customer-assets', 'company', customerId] });
            setAssetId(saved.id);
          }}
        />
      )}
      {creatingCustomer && (
        <CompanyFormModal
          lockedRole="CUSTOMER"
          onClose={() => setCreatingCustomer(false)}
          onSaved={(c) => {
            setCustomerId(c.id);
            setAssetId('');
            setIntakeValues({});
          }}
        />
      )}
    </div>
  );
}
