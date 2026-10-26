'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Select from '@/components/ui/Select';
import {
  ASSET_FIELD_TYPE_LABELS,
  customerAssetsApi,
  type AssetFieldDef,
  type AssetFieldType,
  type CustomerAssetType,
} from '@/lib/customerAssets';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface FieldDraft extends AssetFieldDef {
  /** Campo recién agregado (todavía sin clave): puede cambiar de tipo. */
  isNew?: boolean;
  optionsText: string;
}

function toDrafts(type: CustomerAssetType): FieldDraft[] {
  return type.fields.map((f) => ({ ...f, optionsText: (f.options ?? []).join(', ') }));
}

function errorMessage(err: unknown, fallback: string): string {
  const message = (err as AxiosError<{ message?: string | string[] }> | undefined)?.response?.data?.message;
  if (!message) return fallback;
  return Array.isArray(message) ? message.join(', ') : message;
}

/** "Tu ficha" en Rubro y módulos: nombre y campos de la ficha del negocio.
 * Un campo con datos no se borra, se oculta; el dato principal no se toca. */
export default function AssetTypeEditor() {
  const typesQuery = useQuery({ queryKey: ['customer-asset-types'], queryFn: customerAssetsApi.listTypes });
  const types = typesQuery.data ?? [];
  const [newName, setNewName] = useState('');
  const queryClient = useQueryClient();
  const createMutation = useMutation({
    mutationFn: () => customerAssetsApi.createType(newName.trim()),
    onSuccess: () => {
      setNewName('');
      void queryClient.invalidateQueries({ queryKey: ['customer-asset-types'] });
    },
  });

  if (typesQuery.isLoading) return null;
  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="text-base font-semibold">Tus fichas</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Los datos que guardás de cada {types[0]?.name.toLowerCase() ?? 'bien'} de tus clientes.
      </p>
      <div className="flex flex-col gap-4">
        {types.map((t) => (
          <TypeForm key={`${t.id}-${t.fields.length}`} type={t} />
        ))}
      </div>
      {types.length === 0 && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (newName.trim().length >= 2) createMutation.mutate();
          }}
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="asset-type-name" className="text-sm text-muted-foreground">
              ¿Sobre qué trabajás? (ej.: Vehículo, Equipo, Mascota)
            </label>
            <Input id="asset-type-name" value={newName} onChange={(e) => setNewName(e.target.value)} className="w-64" />
          </div>
          <Button type="submit" disabled={createMutation.isPending || newName.trim().length < 2}>
            Crear ficha
          </Button>
          {createMutation.isError && <p className="w-full text-sm text-destructive">{errorMessage(createMutation.error, 'No se pudo crear')}</p>}
        </form>
      )}
    </section>
  );
}

function TypeForm({ type }: { type: CustomerAssetType }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(type.name);
  const [pluralName, setPluralName] = useState(type.pluralName);
  const [fields, setFields] = useState<FieldDraft[]>(() => toDrafts(type));
  const [message, setMessage] = useState('');

  const saveMutation = useMutation({
    mutationFn: () =>
      customerAssetsApi.updateType(type.id, {
        name: name.trim(),
        pluralName: pluralName.trim(),
        fields: fields.map((f) => ({
          key: f.isNew ? '' : f.key,
          label: f.label,
          type: f.type,
          required: f.required,
          hidden: f.hidden,
          ...(f.type === 'SELECT'
            ? { options: f.optionsText.split(',').map((o) => o.trim()).filter(Boolean) }
            : {}),
        })),
      }),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['customer-asset-types'] });
      setFields(toDrafts(saved));
      setMessage('Guardado.');
    },
    onError: (err) => setMessage(errorMessage(err, 'No se pudo guardar')),
  });

  function update(index: number, patch: Partial<FieldDraft>) {
    setMessage('');
    setFields((list) => list.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`tname-${type.id}`} className="text-sm text-muted-foreground">
            Nombre
          </label>
          <Input id={`tname-${type.id}`} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`tplural-${type.id}`} className="text-sm text-muted-foreground">
            En el menú (plural)
          </label>
          <Input id={`tplural-${type.id}`} value={pluralName} onChange={(e) => setPluralName(e.target.value)} />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="py-2 pr-2">Campo</th>
              <th className="py-2 pr-2">Tipo</th>
              <th className="py-2 pr-2">Obligatorio</th>
              <th className="py-2 pr-2" />
            </tr>
          </thead>
          <tbody>
            {fields.map((f, i) => (
              <tr key={f.key || `new-${i}`} className={`border-b last:border-0 align-top ${f.hidden ? 'opacity-50' : ''}`}>
                <td className="py-2 pr-2">
                  <Input
                    aria-label="Nombre del campo"
                    value={f.label}
                    onChange={(e) => update(i, { label: e.target.value })}
                    disabled={f.hidden}
                  />
                  {f.type === 'SELECT' && !f.hidden && (
                    <Input
                      aria-label="Opciones"
                      value={f.optionsText}
                      onChange={(e) => update(i, { optionsText: e.target.value })}
                      placeholder="Opciones separadas por coma"
                      className="mt-1.5 text-xs"
                    />
                  )}
                </td>
                <td className="py-2 pr-2">
                  {f.isNew ? (
                    <Select
                      value={f.type}
                      onChange={(v) => update(i, { type: v as AssetFieldType })}
                      options={(Object.keys(ASSET_FIELD_TYPE_LABELS) as AssetFieldType[]).map((t) => ({
                        value: t,
                        label: ASSET_FIELD_TYPE_LABELS[t],
                      }))}
                    />
                  ) : (
                    <span className="inline-block pt-2 text-muted-foreground">{ASSET_FIELD_TYPE_LABELS[f.type]}</span>
                  )}
                </td>
                <td className="py-2 pr-2 pt-4">
                  {f.isIdentifier ? (
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                      Dato principal
                    </span>
                  ) : (
                    <input
                      type="checkbox"
                      aria-label={`${f.label} obligatorio`}
                      checked={Boolean(f.required)}
                      onChange={(e) => update(i, { required: e.target.checked })}
                      disabled={f.hidden}
                      className="h-4 w-4 accent-indigo-600"
                    />
                  )}
                </td>
                <td className="py-2 pt-3 text-right">
                  {!f.isIdentifier &&
                    (f.isNew ? (
                      <button type="button" onClick={() => setFields((list) => list.filter((_, j) => j !== i))} className="text-xs text-muted-foreground hover:text-foreground">
                        Quitar
                      </button>
                    ) : (
                      <button type="button" onClick={() => update(i, { hidden: !f.hidden })} className="text-xs text-muted-foreground hover:text-foreground">
                        {f.hidden ? 'Mostrar' : 'Ocultar'}
                      </button>
                    ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Ocultar un campo no borra lo que ya cargaste: deja de pedirse y lo podés volver a mostrar.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setFields((list) => [...list, { key: '', label: '', type: 'TEXT', optionsText: '', isNew: true }])}
        >
          + Agregar campo
        </Button>
        <Button type="button" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? 'Guardando…' : 'Guardar ficha'}
        </Button>
        {message && <span className="text-sm text-muted-foreground">{message}</span>}
      </div>
    </div>
  );
}
