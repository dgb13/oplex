'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { resolveUploadUrl } from '@/lib/inventory';
import { tenantLogoApi, tenantSettingsApi, type TenantSettings } from '@/lib/tenantSettings';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useRef, useState } from 'react';

const OPLEX_INDIGO = '#4f39f6';

type TextField =
  | 'tradeName'
  | 'contactPhone'
  | 'contactEmail'
  | 'website'
  | 'bankName'
  | 'bankCbu'
  | 'bankAlias'
  | 'quoteDefaultPaymentTerms'
  | 'quoteDefaultDeliveryTerms'
  | 'quoteDefaultDeliveryPlace'
  | 'quoteDefaultWarranty';

const TEXT_FIELDS: TextField[] = [
  'tradeName',
  'contactPhone',
  'contactEmail',
  'website',
  'bankName',
  'bankCbu',
  'bankAlias',
  'quoteDefaultPaymentTerms',
  'quoteDefaultDeliveryTerms',
  'quoteDefaultDeliveryPlace',
  'quoteDefaultWarranty',
];

function errorMessage(err: AxiosError<{ message?: string | string[] }>, fallback: string): string {
  const message = err.response?.data?.message ?? fallback;
  return Array.isArray(message) ? message.join(', ') : message;
}

/** Logo, contacto, color, datos bancarios y condiciones comerciales por
 * defecto que salen en el PDF de las cotizaciones (ver TenantSettings.tradeName
 * en el schema y libs/modules/quotes/src/lib/pdf). */
export default function DocumentBrandingCard({ settings }: { settings: TenantSettings }) {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState<Record<TextField, string>>(
    () => Object.fromEntries(TEXT_FIELDS.map((field) => [field, settings[field] ?? ''])) as Record<TextField, string>,
  );
  const [brandColor, setBrandColor] = useState(settings.brandColor ?? '');
  const [showBank, setShowBank] = useState(settings.quoteShowBankDetails);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  function onSaved(next: TenantSettings) {
    queryClient.setQueryData(['tenant-settings'], next);
  }

  const save = useMutation({
    mutationFn: () =>
      tenantSettingsApi.update({
        ...Object.fromEntries(TEXT_FIELDS.map((field) => [field, values[field].trim() || null])),
        bankCbu: values.bankCbu.replace(/\D/g, '') || null,
        brandColor: brandColor || null,
        quoteShowBankDetails: showBank,
      }),
    onSuccess: (next) => {
      onSaved(next);
      setError('');
      setMessage('Guardado');
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      setMessage('');
      setError(errorMessage(err, 'No se pudo guardar'));
    },
  });

  const uploadLogo = useMutation({
    mutationFn: (file: File) => tenantLogoApi.upload(file),
    onSuccess: (next) => {
      onSaved(next);
      setError('');
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => setError(errorMessage(err, 'No se pudo subir el logo')),
  });

  const removeLogo = useMutation({
    mutationFn: () => tenantLogoApi.remove(),
    onSuccess: onSaved,
  });

  function field(name: TextField, label: string, placeholder: string, className = '') {
    return (
      <label className={`flex flex-col gap-1 text-xs text-muted-foreground ${className}`} htmlFor={`branding-${name}`}>
        {label}
        <Input
          id={`branding-${name}`}
          value={values[name]}
          onChange={(e) => {
            setMessage('');
            setValues({ ...values, [name]: e.target.value });
          }}
          placeholder={placeholder}
        />
      </label>
    );
  }

  const logoSrc = resolveUploadUrl(settings.logoUrl);
  const initials = (values.tradeName || settings.tenantName || 'O')
    .split(/\s+/)
    .filter((word) => /^[A-Za-zÁÉÍÓÚÑ]/.test(word))
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();

  return (
    <Card>
      <CardContent className="flex flex-col gap-5">
        <div>
          <h2 className="mb-1 text-sm font-medium text-muted-foreground">Tu empresa en los documentos</h2>
          <p className="text-xs text-muted-foreground">
            Lo que ve tu cliente en el PDF de las cotizaciones. Razón social, CUIT, condición frente al IVA, domicilio e
            Ingresos Brutos se cargan en Contabilidad → Conexión con ARCA → Datos de la empresa.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {logoSrc ? (
            <img src={logoSrc} alt="Logo de la empresa" className="h-16 w-16 rounded-lg border object-contain p-1" />
          ) : (
            <div
              className="grid h-16 w-16 place-items-center rounded-lg text-lg font-bold text-white"
              style={{ backgroundColor: brandColor || OPLEX_INDIGO }}
              aria-label="Sin logo: se usan las iniciales"
            >
              {initials}
            </div>
          )}
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInput.current?.click()}
                disabled={uploadLogo.isPending}
              >
                {uploadLogo.isPending ? 'Subiendo...' : logoSrc ? 'Cambiar logo' : 'Subir logo'}
              </Button>
              {logoSrc && (
                <Button type="button" variant="ghost" size="sm" onClick={() => removeLogo.mutate()} disabled={removeLogo.isPending}>
                  Quitar
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">PNG o JPG, hasta 2MB. Sin logo, el PDF muestra tus iniciales.</p>
            <input
              ref={fileInput}
              id="branding-logo"
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadLogo.mutate(file);
                e.target.value = '';
              }}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {field('tradeName', 'Nombre de fantasía', 'p. ej. MetalSur')}
          <label className="flex flex-col gap-1 text-xs text-muted-foreground" htmlFor="branding-color">
            Color de marca
            <div className="flex items-center gap-2">
              <input
                id="branding-color"
                type="color"
                value={brandColor || OPLEX_INDIGO}
                onChange={(e) => {
                  setMessage('');
                  setBrandColor(e.target.value);
                }}
                className="h-9 w-12 cursor-pointer rounded-md border bg-transparent p-1"
              />
              <span className="font-mono text-xs">{brandColor || 'Índigo de Oplex'}</span>
              {brandColor && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setBrandColor('')}>
                  Usar el de Oplex
                </Button>
              )}
            </div>
          </label>
          {field('contactPhone', 'Teléfono', '(011) 4201-5566')}
          {field('contactEmail', 'Email', 'ventas@tuempresa.com.ar')}
          {field('website', 'Sitio web', 'tuempresa.com.ar', 'sm:col-span-2')}
        </div>

        <div className="flex flex-col gap-3 rounded-lg border p-4">
          <label className="flex items-center gap-2 text-sm" htmlFor="branding-show-bank">
            <input id="branding-show-bank" type="checkbox" checked={showBank} onChange={(e) => setShowBank(e.target.checked)} />
            Mostrar los datos para transferir en las cotizaciones
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            {field('bankName', 'Banco', 'Banco Galicia')}
            {field('bankCbu', 'CBU o CVU', '22 números')}
            {field('bankAlias', 'Alias', 'TU.ALIAS.VENTAS')}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Condiciones con las que arranca cada cotización nueva (se pueden cambiar en cada una)
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {field('quoteDefaultPaymentTerms', 'Forma de pago', '50% anticipo, saldo contra entrega')}
            {field('quoteDefaultDeliveryTerms', 'Plazo de entrega', '10 días hábiles desde la aprobación')}
            {field('quoteDefaultDeliveryPlace', 'Lugar de entrega', 'Retira el cliente en nuestro depósito')}
            {field('quoteDefaultWarranty', 'Garantía', '6 meses por defectos de fabricación')}
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {message && <p className="text-sm text-green-600 dark:text-green-400">{message}</p>}
        <Button type="button" className="self-start" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? 'Guardando...' : 'Guardar cambios'}
        </Button>
      </CardContent>
    </Card>
  );
}
