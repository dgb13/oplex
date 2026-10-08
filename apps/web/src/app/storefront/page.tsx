'use client';

import Storefront from '@/components/storefront/Storefront';
import { inventoryApi } from '@/lib/inventory';
import {
  STOREFRONT_TEMPLATES,
  storefrontApi,
  type StorefrontSettingsInput,
  type StorefrontTemplate,
} from '@/lib/storefront';
import { resolveUploadUrl } from '@/lib/inventory';
import { shrinkImage } from '@/lib/shrinkImage';
import { tenantLogoApi, tenantSettingsApi } from '@/lib/tenantSettings';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { Check, ExternalLink, Eye, Monitor, Smartphone, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

const SWATCHES = ['#4f46e5', '#0f766e', '#b91c1c', '#c2410c', '#1f2937'];

const EMPTY: StorefrontSettingsInput = {
  subdomain: '',
  published: false,
  template: 'aire',
  accentColor: null,
  warehouseId: null,
  stockDisplay: 'LOW',
  whatsappNumber: null,
  notifyEmail: null,
  heroTitle: null,
  heroSubtitle: null,
};

/** Configurar tienda (boceto aprobado, pantalla 2). */
export default function StorefrontSettingsPage() {
  const queryClient = useQueryClient();
  const viewQuery = useQuery({ queryKey: ['storefront-settings'], queryFn: storefrontApi.getAdminView });
  const warehousesQuery = useQuery({ queryKey: ['warehouses'], queryFn: inventoryApi.listWarehouses });
  const tenantQuery = useQuery({ queryKey: ['tenant-settings'], queryFn: tenantSettingsApi.get });
  const view = viewQuery.data;

  const [form, setForm] = useState<StorefrontSettingsInput>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewPhone, setPreviewPhone] = useState(false);
  const [check, setCheck] = useState<{ subdomain: string; available: boolean; message: string | null } | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!view || loaded) return;
    const s = view.settings;
    setForm(
      s
        ? {
            subdomain: s.subdomain,
            published: s.published,
            template: s.template,
            accentColor: s.accentColor,
            warehouseId: s.warehouseId,
            stockDisplay: s.stockDisplay,
            whatsappNumber: s.whatsappNumber,
            notifyEmail: s.notifyEmail,
            heroTitle: s.heroTitle,
            heroSubtitle: s.heroSubtitle,
          }
        : { ...EMPTY, subdomain: view.suggestedSubdomain },
    );
    setLoaded(true);
  }, [view, loaded]);

  // Disponibilidad de la dirección mientras se escribe (la garantía real
  // es el índice único de la base; esto es para avisar antes de guardar).
  useEffect(() => {
    if (!loaded || !form.subdomain) {
      setCheck(null);
      return;
    }
    const handle = window.setTimeout(() => {
      storefrontApi
        .checkSubdomain(form.subdomain)
        .then(setCheck)
        .catch(() => setCheck(null));
    }, 350);
    return () => window.clearTimeout(handle);
  }, [form.subdomain, loaded]);

  const previewQuery = useQuery({ queryKey: ['storefront-preview'], queryFn: storefrontApi.preview, enabled: previewOpen });

  const save = useMutation({
    mutationFn: () => storefrontApi.save(form),
    onSuccess: (saved) => {
      setForm((f) => ({ ...f, subdomain: saved.subdomain }));
      void queryClient.invalidateQueries({ queryKey: ['storefront-settings'] });
      void queryClient.invalidateQueries({ queryKey: ['storefront-preview'] });
      toast.success(saved.published ? 'Tienda guardada y publicada' : 'Tienda guardada (sin publicar)');
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const m = err.response?.data?.message ?? 'No se pudo guardar la tienda';
      toast.error(Array.isArray(m) ? m[0] : m);
    },
  });

  const logo = useMutation({
    mutationFn: (file: File) => tenantLogoApi.upload(file),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });
      toast.success('Logo actualizado');
    },
    onError: () => toast.error('No se pudo subir el logo (PNG o JPG)'),
  });

  const cover = useMutation({
    mutationFn: async (file: File | null) => {
      if (!file) return storefrontApi.removeCover();
      const { blob } = await shrinkImage(file, 2000);
      return storefrontApi.uploadCover(blob);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['storefront-settings'] });
      void queryClient.invalidateQueries({ queryKey: ['storefront-preview'] });
      toast.success('Portada actualizada');
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const m = err.response?.data?.message ?? 'No se pudo subir la portada (JPG, PNG o WEBP)';
      toast.error(Array.isArray(m) ? m[0] : m);
    },
  });

  if (viewQuery.isLoading || !view) {
    return <div className="py-16 text-center text-muted-foreground">Cargando...</div>;
  }

  const set = <K extends keyof StorefrontSettingsInput>(key: K, value: StorefrontSettingsInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  const disabled = !view.planEnabled;
  const noTax = !view.taxCondition;
  const coverage = view.coverage;
  const address = `${check?.subdomain || form.subdomain || 'tutienda'}.${view.rootDomain}`;
  const logoUrl = resolveUploadUrl(tenantQuery.data?.logoUrl ?? null);
  const savedPublished = view.settings?.published ?? false;
  const coverUrl = resolveUploadUrl(view.settings?.coverImageUrl ?? null);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Tienda online</h1>
          <p className="text-sm text-muted-foreground">Tu catálogo con stock y precios al día, en tu propia dirección. Los pedidos te llegan por WhatsApp.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setPreviewOpen(true)} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition hover:bg-muted">
            <Eye className="h-4 w-4" /> Ver cómo queda
          </button>
          <button
            onClick={() => save.mutate()}
            disabled={disabled || save.isPending || (check !== null && !check.available)}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
          >
            {save.isPending ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>

      {disabled && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <span>
            Tu plan actual{view.planName ? ` (${view.planName})` : ''} no incluye la tienda online. Está incluida desde el plan <b>Silver</b>. Podés mirar
            cómo quedaría, pero para publicarla tenés que cambiar de plan.
          </span>
          <a href="/settings/billing" className="whitespace-nowrap font-semibold underline">
            Mejorar plan →
          </a>
        </div>
      )}
      {noTax && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <span>Antes de publicar, cargá tu condición frente al IVA: sin ella no se sabe qué precio final mostrar.</span>
          <Link href="/accounting/arca" className="whitespace-nowrap font-semibold underline">
            Cargarla ahora →
          </Link>
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Section title="Tu tienda online" right={<span className={pill(savedPublished ? 'ok' : 'warn')}>{savedPublished ? 'Publicada' : 'Sin publicar'}</span>}>
            <label className="flex items-center gap-3 text-sm font-semibold">
              <Switch checked={form.published} disabled={disabled || noTax} onChange={(v) => set('published', v)} label="Tienda publicada" />
              {form.published ? 'Visible para cualquiera que tenga la dirección' : 'Sólo la ves vos (vista previa)'}
            </label>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Dirección de la tienda</span>
              <div className="flex max-w-lg items-stretch overflow-hidden rounded-lg border">
                <span className="bg-muted px-3 py-2 text-sm text-muted-foreground">https://</span>
                <input
                  id="storefront-subdomain"
                  value={form.subdomain}
                  onChange={(e) => set('subdomain', e.target.value)}
                  disabled={disabled}
                  maxLength={60}
                  aria-label="Nombre de la tienda en la dirección"
                  className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm font-semibold outline-none"
                />
                <span className="py-2 pr-3 text-sm text-muted-foreground">.{view.rootDomain}</span>
              </div>
              <span className={`text-xs ${check && !check.available ? 'text-destructive' : 'text-muted-foreground'}`}>
                {check
                  ? check.available
                    ? `✓ Disponible · Queda así: ${address}`
                    : check.message
                  : 'Sólo letras, números y guiones. Mayúsculas, acentos y espacios se acomodan solos.'}
              </span>
            </div>
          </Section>

          <Section title="Plantilla" sub="Elegí cómo se ve. Podés cambiarla cuando quieras: tus artículos, fotos y precios no se tocan.">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {STOREFRONT_TEMPLATES.map((tpl, i) => (
                <button
                  key={tpl.id}
                  onClick={() => set('template', tpl.id as StorefrontTemplate)}
                  aria-pressed={form.template === tpl.id}
                  className={`flex flex-col gap-2 rounded-xl border p-2 text-left transition hover:border-primary ${form.template === tpl.id ? 'border-primary ring-3 ring-primary/20' : ''}`}
                >
                  <img
                    src={`/storefront/templates/${tpl.id}.jpg`}
                    alt={`Plantilla ${tpl.name}`}
                    loading="lazy"
                    className="aspect-[16/10] w-full rounded-lg border object-cover object-top"
                  />
                  <strong className="text-sm">
                    {i + 1}. {tpl.name}
                  </strong>
                  <small className="text-xs leading-snug text-muted-foreground">
                    <b className="font-semibold">{tpl.vibe}.</b> {tpl.what}
                  </small>
                </button>
              ))}
            </div>
          </Section>

          <Section title="Tu marca">
            <div className="flex items-center gap-4">
              <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-xl border border-dashed bg-muted text-center text-xs font-semibold text-muted-foreground">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="h-full w-full object-contain" />
                ) : (
                  <>
                    Tu
                    <br />
                    logo
                  </>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <button onClick={() => logoInput.current?.click()} disabled={logo.isPending} className="self-start rounded-lg border px-3 py-1.5 text-sm font-semibold transition hover:bg-muted">
                  {logo.isPending ? 'Subiendo...' : logoUrl ? 'Cambiar logo' : 'Subir logo'}
                </button>
                <span className="text-xs text-muted-foreground">PNG o JPG. Es el mismo logo de tus cotizaciones. Sin logo, va el nombre con la letra de la plantilla.</span>
                <input
                  ref={logoInput}
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) logo.mutate(file);
                    e.target.value = '';
                  }}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <div className="grid aspect-[16/9] w-40 place-items-center overflow-hidden rounded-xl border border-dashed bg-muted text-center text-xs font-semibold text-muted-foreground">
                {coverUrl ? <img src={coverUrl} alt="Portada" className="h-full w-full object-cover" /> : 'Foto de portada'}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => coverInput.current?.click()}
                    disabled={disabled || cover.isPending || !view.settings}
                    className="self-start rounded-lg border px-3 py-1.5 text-sm font-semibold transition hover:bg-muted disabled:opacity-50"
                  >
                    {cover.isPending ? 'Subiendo...' : coverUrl ? 'Cambiar portada' : 'Subir portada'}
                  </button>
                  {coverUrl && (
                    <button onClick={() => cover.mutate(null)} disabled={cover.isPending} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-muted-foreground hover:bg-muted">
                      Quitar
                    </button>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {view.settings
                    ? 'La foto grande de la portada (horizontal, idealmente de 2000 px de ancho). Sin portada, va la primera foto del catálogo.'
                    : 'Guardá la tienda una vez y después subís la foto de portada.'}
                </span>
                <input
                  ref={coverInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) cover.mutate(file);
                    e.target.value = '';
                  }}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Color de botones y detalles</span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => set('accentColor', null)}
                  aria-pressed={!form.accentColor}
                  className={`h-8 rounded-full border px-3 text-xs font-semibold ${!form.accentColor ? 'ring-2 ring-primary' : ''}`}
                >
                  El de la plantilla
                </button>
                {SWATCHES.map((c) => (
                  <button
                    key={c}
                    onClick={() => set('accentColor', c)}
                    aria-pressed={form.accentColor === c}
                    aria-label={`Color ${c}`}
                    className={`h-8 w-8 rounded-full border-2 border-background ${form.accentColor === c ? 'ring-2 ring-primary' : 'ring-1 ring-border'}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Título de la portada (opcional)">
                <input
                  value={form.heroTitle ?? ''}
                  onChange={(e) => set('heroTitle', e.target.value || null)}
                  maxLength={80}
                  placeholder="Vacío = el de la plantilla"
                  className={inputClass}
                />
              </Field>
              <Field label="Bajada (opcional)">
                <input
                  value={form.heroSubtitle ?? ''}
                  onChange={(e) => set('heroSubtitle', e.target.value || null)}
                  maxLength={220}
                  placeholder="Ej.: Envíos a todo el país"
                  className={inputClass}
                />
              </Field>
            </div>
          </Section>

          <Section title="Qué artículos aparecen" sub="Entran solos, sin cargar nada aparte. Un artículo se ve en la tienda cuando cumple las cuatro cosas:">
            <div className="flex flex-col gap-2 text-sm">
              <Rule>
                Está marcado como <b>Publicado en la tienda</b>
              </Rule>
              <Rule>Tiene stock (en el depósito que elijas abajo)</Rule>
              <Rule>Tiene precio de venta</Rule>
              <Rule>Tiene categoría</Rule>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Precio que se muestra">
                <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                  {view.taxCondition === 'RESPONSABLE_INSCRIPTO' ? 'Precio de venta + IVA (precio final)' : 'Precio de venta (precio final)'}
                </div>
              </Field>
              <Field label="Stock de">
                <select value={form.warehouseId ?? ''} onChange={(e) => set('warehouseId', e.target.value || null)} className={inputClass}>
                  <option value="">Todos los depósitos</option>
                  {(warehousesQuery.data ?? []).map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Cómo mostrar el stock">
              <div className="flex flex-col gap-2 text-sm">
                {(
                  [
                    ['LOW', 'Avisar “Quedan 3” sólo cuando quedan 5 o menos', true],
                    ['ALWAYS', 'Mostrar siempre la cantidad', false],
                    ['NEVER', 'No mostrar cantidades', false],
                  ] as const
                ).map(([value, label, suggested]) => (
                  <label key={value} className="flex items-center gap-2">
                    <input type="radio" name="stockDisplay" checked={form.stockDisplay === value} onChange={() => set('stockDisplay', value)} className="accent-primary" />
                    {label}
                    {suggested && <span className={pill('soft')}>sugerido</span>}
                  </label>
                ))}
              </div>
            </Field>
          </Section>

          <Section title="Cómo te llegan los pedidos" sub="El cliente arma el pedido y lo manda. Vos confirmás stock, envío y cobro como siempre.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="WhatsApp del negocio">
                <input
                  value={form.whatsappNumber ?? ''}
                  onChange={(e) => set('whatsappNumber', e.target.value || null)}
                  placeholder="+54 9 261 555-0142"
                  inputMode="tel"
                  className={inputClass}
                />
              </Field>
              <Field label="Además, avisame por email a">
                <input
                  value={form.notifyEmail ?? ''}
                  onChange={(e) => set('notifyEmail', e.target.value || null)}
                  placeholder="pedidos@tunegocio.com.ar"
                  inputMode="email"
                  className={inputClass}
                />
              </Field>
            </div>
            <Rule>
              Cada pedido queda guardado en Oplex (<Link href="/storefront/orders" className="font-semibold text-primary">Ventas → Pedidos de la tienda</Link>) y te avisa la campana
            </Rule>
            <div className="flex items-start gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              <span className={pill('soft')}>Etapa B</span>
              <div>
                <b className="text-foreground">Cobro online con Mercado Pago</b>
                <br />
                Carrito con pago, descuento automático de stock y envíos. La tienda ya queda preparada; se activa cuando lo sumemos.
              </div>
            </div>
          </Section>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
          <div className="flex flex-col gap-2 rounded-xl border bg-card p-4 text-sm text-muted-foreground">
            <span className={`${pill(view.planEnabled ? 'ok' : 'warn')} self-start`}>{view.planEnabled ? 'Incluida en tu plan' : 'No incluida en tu plan'}</span>
            <b className="text-foreground">Tienda online</b>
            Disponible desde el plan Silver.
            {savedPublished && view.settings && (
              <a href={`https://${view.settings.subdomain}.${view.rootDomain}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary">
                Abrir mi tienda <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
          <Section title="Hoy en tu tienda">
            <div className="grid grid-cols-2 gap-2">
              <Count n={coverage.visible} label="artículos visibles" />
              <Count n={coverage.total - coverage.visible} label="quedan afuera" />
            </div>
            <div className="flex flex-col text-sm">
              <OutRow label="No están publicados" n={coverage.notPublished} />
              <OutRow label="Sin stock" n={coverage.noStock} />
              <OutRow label="Sin categoría" n={coverage.noCategory} />
              <OutRow label="Sin precio de venta" n={coverage.noPrice} />
            </div>
            <span className="text-xs text-muted-foreground">
              Se corrigen en <Link href="/inventory" className="font-semibold text-primary">Inventario</Link>, desde la ficha de cada artículo (pestaña “Tienda online”).
            </span>
          </Section>
          {view.newOrders > 0 && (
            <Link href="/storefront/orders" className="rounded-xl border bg-card p-4 text-sm font-semibold text-primary">
              {view.newOrders} pedido{view.newOrders === 1 ? '' : 's'} nuevo{view.newOrders === 1 ? '' : 's'} para revisar →
            </Link>
          )}
        </aside>
      </div>

      {previewOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-sm">
            <span>
              <b>Vista previa</b> · {address} · <span className="text-muted-foreground">con los cambios sin guardar; los pedidos no se envían</span>
            </span>
            <div className="flex gap-2">
              <div className="flex overflow-hidden rounded-lg border" role="group" aria-label="Equipo">
                <button
                  onClick={() => setPreviewPhone(false)}
                  aria-pressed={!previewPhone}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 font-semibold ${!previewPhone ? 'bg-muted' : ''}`}
                >
                  <Monitor className="h-4 w-4" /> Computadora
                </button>
                <button
                  onClick={() => setPreviewPhone(true)}
                  aria-pressed={previewPhone}
                  className={`inline-flex items-center gap-1 border-l px-3 py-1.5 font-semibold ${previewPhone ? 'bg-muted' : ''}`}
                >
                  <Smartphone className="h-4 w-4" /> Celular
                </button>
              </div>
              <button onClick={() => setPreviewOpen(false)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 font-semibold">
                <X className="h-4 w-4" /> Cerrar
              </button>
            </div>
          </div>
          <div className={`relative flex-1 overflow-hidden ${previewPhone ? 'mx-auto my-3 w-[390px] max-w-full rounded-[28px] border-[8px] border-neutral-900' : 'w-full'}`}>
            {previewQuery.data ? (
              <Storefront
                preview
                data={{
                  ...previewQuery.data,
                  store: {
                    ...previewQuery.data.store,
                    subdomain: form.subdomain || previewQuery.data.store.subdomain,
                    template: form.template,
                    accentColor: form.accentColor,
                    heroTitle: form.heroTitle,
                    heroSubtitle: form.heroSubtitle,
                    whatsappNumber: form.whatsappNumber,
                  },
                }}
              />
            ) : (
              <div className="py-16 text-center text-muted-foreground">Cargando la vista previa...</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const inputClass =
  'h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

function pill(kind: 'ok' | 'warn' | 'soft') {
  const base = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold';
  if (kind === 'ok') return `${base} bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300`;
  if (kind === 'warn') return `${base} bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300`;
  return `${base} bg-primary/10 text-primary`;
}

function Section({ title, sub, right, children }: { title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">{title}</h2>
          {right}
        </div>
        {sub && <p className="text-sm text-muted-foreground">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Rule({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 text-sm">
      <span className="grid h-5 w-5 flex-none place-items-center rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
        <Check className="h-3.5 w-3.5" />
      </span>
      <span>{children}</span>
    </div>
  );
}

function Switch({ checked, disabled, onChange, label }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 flex-none rounded-full transition disabled:opacity-50 ${checked ? 'bg-emerald-600' : 'bg-muted-foreground/30'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

function Count({ n, label }: { n: number; label: string }) {
  return (
    <div className="rounded-lg border px-3 py-2">
      <b className="block text-2xl tabular-nums">{n}</b>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function OutRow({ label, n }: { label: string; n: number }) {
  return (
    <div className="flex justify-between border-b py-1.5 last:border-b-0">
      <span>{label}</span>
      <span className="font-semibold tabular-nums">{n}</span>
    </div>
  );
}
