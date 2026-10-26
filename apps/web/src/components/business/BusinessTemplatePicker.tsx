'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  BUSINESS_FAMILIES,
  BUSINESS_MODULE_LABELS,
  BUSINESS_MODULES,
  businessProfileApi,
  type BusinessTemplate,
} from '@/lib/businessModules';
import { BusinessTemplateIcon } from '@/lib/businessTemplateIcons';
import { useMutation } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useMemo, useState } from 'react';

const AVAILABLE = new Set(BUSINESS_MODULES.filter((m) => m.status === 'available').map((m) => m.key));
const UPCOMING = new Set(BUSINESS_MODULES.filter((m) => m.status === 'upcoming').map((m) => m.key));

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

interface Props {
  templates: BusinessTemplate[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  /** Botón principal del panel ("Continuar", "Cambiar a este rubro"). */
  actionLabel: string;
  onConfirm: (template: BusinessTemplate) => void;
  confirming?: boolean;
  /** Texto bajo el botón (ej. "No se apaga nada de lo que ya usás"). */
  footnote?: string;
}

/** Catálogo de rubros con buscador, filtro por familia y el detalle de lo
 * que deja listo el elegido. Mismo diseño que la maqueta aprobada. */
export default function BusinessTemplatePicker({
  templates,
  selectedKey,
  onSelect,
  actionLabel,
  onConfirm,
  confirming,
  footnote,
}: Props) {
  const [query, setQuery] = useState('');
  const [family, setFamily] = useState('Todos');
  const [requestText, setRequestText] = useState('');
  const [requestSent, setRequestSent] = useState(false);

  const families = useMemo(
    () => ['Todos', ...BUSINESS_FAMILIES.filter((f) => templates.some((t) => t.family === f))],
    [templates],
  );
  const visible = useMemo(() => {
    const words = normalize(query).split(/\s+/).filter(Boolean);
    return templates.filter((t) => {
      if (family !== 'Todos' && t.family !== family) return false;
      const haystack = normalize(`${t.name} ${t.family}`);
      return words.every((w) => haystack.includes(w));
    });
  }, [templates, query, family]);
  const selected = templates.find((t) => t.key === selectedKey) ?? null;

  const requestMutation = useMutation({
    mutationFn: () => businessProfileApi.requestTemplate(requestText.trim()),
    onSuccess: () => setRequestSent(true),
  });

  const availableModules = selected?.config.modules.filter((m) => AVAILABLE.has(m)) ?? [];
  const upcomingModules = selected?.config.modules.filter((m) => UPCOMING.has(m)) ?? [];

  return (
    <div className="flex flex-wrap gap-6">
      <div className="min-w-0 flex-[999_1_520px]">
        <label htmlFor="rubro-search" className="mb-1.5 block text-sm font-medium">
          Buscá tu rubro
        </label>
        <Input
          id="rubro-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ej.: taller, kiosco, dentista, carpintería…"
          className="h-11 text-base"
        />
        <div role="group" aria-label="Filtrar por familia" className="my-4 flex flex-wrap gap-1.5">
          {families.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={f === family}
              onClick={() => setFamily(f)}
              className={`h-8 rounded-full border px-3 text-xs font-medium transition ${
                f === family
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-border bg-card text-foreground hover:border-indigo-300'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {visible.length > 0 ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5">
            {visible.map((t) => {
              const isSelected = t.key === selectedKey;
              return (
                <button
                  key={t.key}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => onSelect(t.key)}
                  className={`flex min-h-[104px] flex-col items-start gap-2.5 rounded-xl border p-3.5 text-left transition ${
                    isSelected
                      ? 'border-2 border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40'
                      : 'bg-card hover:border-indigo-300'
                  }`}
                >
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                      isSelected ? 'bg-card' : 'bg-indigo-50 dark:bg-indigo-950/40'
                    }`}
                  >
                    <BusinessTemplateIcon iconKey={t.iconKey} className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  </span>
                  <span className={`text-sm leading-snug ${isSelected ? 'font-semibold' : 'font-medium'}`}>{t.name}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">No encontramos ese rubro.</p>
        )}

        <div className="mt-5 rounded-xl border bg-card p-4">
          <p className="text-sm font-medium">¿No está el tuyo?</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Elegí &quot;Otro rubro (genérico)&quot; y contanos a qué te dedicás: lo sumamos al catálogo.
          </p>
          {requestSent ? (
            <p role="status" className="mt-3 text-sm text-green-700 dark:text-green-400">
              ¡Gracias! Lo vamos a revisar.
            </p>
          ) : (
            <form
              className="mt-3 flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (requestText.trim().length >= 2) requestMutation.mutate();
              }}
            >
              <label htmlFor="rubro-request" className="sr-only">
                Tu rubro
              </label>
              <Input
                id="rubro-request"
                value={requestText}
                onChange={(e) => setRequestText(e.target.value)}
                placeholder="Ej.: fábrica de pastas"
                maxLength={120}
                className="min-w-0 flex-[1_1_220px]"
              />
              <Button type="submit" variant="outline" disabled={requestMutation.isPending || requestText.trim().length < 2}>
                Pedir que lo agreguen
              </Button>
            </form>
          )}
        </div>
      </div>

      <aside className="min-w-0 flex-[1_1_300px] self-start rounded-2xl border bg-card p-5">
        {selected ? (
          <>
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-950/40">
                <BusinessTemplateIcon iconKey={selected.iconKey} className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
              </span>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Elegiste</p>
                <p className="text-lg font-bold leading-tight">{selected.name}</p>
              </div>
            </div>

            <h2 className="mb-2 mt-5 text-sm font-semibold">Te dejamos prendido</h2>
            <ul className="flex flex-col gap-1.5">
              {['Artículos y stock', 'Compras', 'Facturación', 'Clientes'].map((label) => (
                <li key={label} className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-indigo-600" aria-hidden="true" />
                  {label}
                </li>
              ))}
              {availableModules.map((m) => (
                <li key={m} className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-indigo-600" aria-hidden="true" />
                  {BUSINESS_MODULE_LABELS[m] ?? m}
                </li>
              ))}
            </ul>

            {upcomingModules.length > 0 && (
              <>
                <h2 className="mb-1 mt-5 text-sm font-semibold">Próximamente para tu rubro</h2>
                <p className="text-sm text-muted-foreground">
                  {upcomingModules
                    .map((m) =>
                      m === 'fichas' && selected.config.assetType
                        ? `${BUSINESS_MODULE_LABELS[m]} (${selected.config.assetType.name.toLowerCase()})`
                        : (BUSINESS_MODULE_LABELS[m] ?? m),
                    )
                    .join(', ')}
                  . Quedan incluidos y se activan cuando salgan.
                </p>
              </>
            )}

            {selected.config.suggestedCategories.length > 0 && (
              <>
                <h2 className="mb-1 mt-5 text-sm font-semibold">Categorías de artículos</h2>
                <p className="text-sm text-muted-foreground">{selected.config.suggestedCategories.join(', ')}</p>
              </>
            )}

            {selected.config.notice && (
              <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">{selected.config.notice}</p>
            )}

            <Button className="mt-5 w-full" size="lg" disabled={confirming} onClick={() => onConfirm(selected)}>
              {confirming ? 'Guardando...' : actionLabel}
            </Button>
            <p className="mt-3 text-xs text-muted-foreground">
              {footnote ?? 'Todo esto lo podés cambiar después en tu menú de usuario → Rubro y módulos.'}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Elegí un rubro para ver qué te dejamos listo.</p>
        )}
      </aside>
    </div>
  );
}
