'use client';

import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { posApi, type CashRegister } from '@/lib/pos';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useEffect, useState } from 'react';

// Valores exactos que acepta Mercado Pago en location.state_name (los
// devolvió su propio error de validación). CABA es "Capital Federal".
const PROVINCES = [
  'Buenos Aires',
  'Capital Federal',
  'Catamarca',
  'Chaco',
  'Chubut',
  'Córdoba',
  'Corrientes',
  'Entre Ríos',
  'Formosa',
  'Jujuy',
  'La Pampa',
  'La Rioja',
  'Mendoza',
  'Misiones',
  'Neuquén',
  'Río Negro',
  'Salta',
  'San Juan',
  'San Luis',
  'Santa Cruz',
  'Santa Fe',
  'Santiago del Estero',
  'Tierra del Fuego',
  'Tucumán',
];

type CoordsResult = { state: 'idle' } | { state: 'ok'; lat: number; lng: number } | { state: 'bad'; message: string };

/** Acepta "-34.60372, -58.38159" o un link de Google Maps que traiga las
 * coordenadas (@lat,lng o !3dlat!4dlng). Un link corto no las trae. */
export function parseCoords(text: string): CoordsResult {
  const t = text.trim();
  if (!t) return { state: 'idle' };
  const patterns = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/,
  ];
  for (const pattern of patterns) {
    const match = t.match(pattern);
    if (match) {
      const lat = Number(match[1]);
      const lng = Number(match[2]);
      if (lat < -56 || lat > -21 || lng < -74 || lng > -53) {
        return { state: 'bad', message: 'Esas coordenadas quedan fuera de Argentina. Revisá que hayas copiado el lugar correcto.' };
      }
      return { state: 'ok', lat, lng };
    }
  }
  if (/goo\.gl|maps\.app/.test(t)) {
    return {
      state: 'bad',
      message:
        'Ese link corto no trae las coordenadas. En Google Maps, mantené apretado el lugar y copiá los números que aparecen arriba (ej: -34.60372, -58.38159).',
    };
  }
  return { state: 'bad', message: 'No encontramos coordenadas. Pegá algo como -34.60372, -58.38159 o un link de Google Maps que las incluya.' };
}

function apiMessage(err: unknown, fallback: string): string {
  const message = (err as AxiosError<{ message?: string | string[] }> | undefined)?.response?.data?.message;
  if (!message) return fallback;
  return Array.isArray(message) ? message.join(', ') : message;
}

const selectClass =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40';

/** Activar / ver el QR de Mercado Pago de una caja (mockup aprobado
 * 2026-10-01). La primera caja de una sucursal da de alta la sucursal en
 * Mercado Pago; las siguientes la reusan. */
export default function RegisterQrModal({ register, onClose }: { register: CashRegister; onClose: () => void }) {
  const queryClient = useQueryClient();
  const setupQuery = useQuery({
    queryKey: ['pos-register-qr', register.id],
    queryFn: () => posApi.getRegisterQr(register.id),
  });
  const setup = setupQuery.data;

  const [streetName, setStreetName] = useState('');
  const [streetNumber, setStreetNumber] = useState('');
  const [cityName, setCityName] = useState('');
  const [stateName, setStateName] = useState('');
  const [geoInput, setGeoInput] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!setup) return;
    setStreetName(setup.address.streetName);
    setStreetNumber(setup.address.streetNumber);
    setCityName(setup.address.cityName);
    setStateName(PROVINCES.includes(setup.address.stateName) ? setup.address.stateName : '');
    if (setup.address.latitude !== null && setup.address.longitude !== null) {
      setGeoInput(`${setup.address.latitude}, ${setup.address.longitude}`);
    }
  }, [setup]);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['pos-register-qr', register.id] });
    void queryClient.invalidateQueries({ queryKey: ['pos-registers'] });
  }

  // Mercado Pago sólo acepta las ciudades de su lista (en CABA, el barrio).
  const citiesQuery = useQuery({
    queryKey: ['mp-qr-cities', stateName],
    queryFn: () => posApi.listQrCities(stateName),
    enabled: Boolean(stateName),
    staleTime: Infinity,
  });
  const cities = citiesQuery.data ?? [];

  // La ciudad precargada (de la dirección fiscal) se conserva sólo si está
  // en la lista, sin importar mayúsculas/acentos.
  useEffect(() => {
    if (!citiesQuery.data || !cityName) return;
    const norm = (v: string) => v.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
    const match = citiesQuery.data.find((c) => norm(c) === norm(cityName));
    if (match !== cityName) setCityName(match ?? '');
  }, [citiesQuery.data, cityName]);

  const coords = parseCoords(geoInput);

  const activate = useMutation({
    mutationFn: () => {
      if (coords.state !== 'ok') throw new Error('Ubicación inválida');
      return posApi.activateRegisterQr(register.id, {
        streetName: streetName.trim(),
        streetNumber: streetNumber.trim(),
        cityName: cityName.trim(),
        stateName,
        latitude: coords.lat,
        longitude: coords.lng,
      });
    },
    onSuccess: () => {
      setError('');
      refresh();
    },
    onError: (err) => setError(apiMessage(err, 'Mercado Pago no aceptó los datos de la sucursal')),
  });

  const deactivate = useMutation({
    mutationFn: () => posApi.deactivateRegisterQr(register.id),
    onSuccess: () => {
      setError('');
      refresh();
    },
    onError: (err) => setError(apiMessage(err, 'No se pudo desactivar el QR')),
  });

  const addressComplete = streetName.trim() && streetNumber.trim() && cityName.trim() && stateName;
  const locked = setup?.storeExists ?? false;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {!setup ? (
          <p className="text-sm text-muted-foreground">{setupQuery.isError ? 'No se pudo cargar la caja.' : 'Cargando...'}</p>
        ) : setup.active ? (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-center justify-between gap-2 pr-6">
                <DialogTitle>
                  {setup.registerName} · Mercado Pago
                </DialogTitle>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  QR activo
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {setup.branchName} · {setup.address.streetName} {setup.address.streetNumber}, {setup.address.cityName}
              </p>
            </DialogHeader>
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-4 text-center">
              {setup.qrImageUrl ? (
                <img src={setup.qrImageUrl} alt={`QR fijo de ${setup.registerName}`} className="h-44 w-44 rounded-lg bg-white p-2" />
              ) : (
                <p className="text-sm text-muted-foreground">Mercado Pago no devolvió la imagen del QR.</p>
              )}
              <p className="font-semibold">QR fijo de {setup.registerName}</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Imprimilo y pegalo en el mostrador. Cuando el cajero toca &quot;Generar QR&quot;, el cliente puede escanear este o el
                de la pantalla.
              </p>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="ghost" disabled={deactivate.isPending} onClick={() => deactivate.mutate()}>
                {deactivate.isPending ? 'Desactivando...' : 'Desactivar QR'}
              </Button>
              {setup.qrTemplateUrl && (
                <a href={setup.qrTemplateUrl} target="_blank" rel="noreferrer" className={buttonVariants()}>
                  Descargar QR para imprimir (PDF)
                </a>
              )}
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-center justify-between gap-2 pr-6">
                <DialogTitle>Activar QR · {setup.registerName}</DialogTitle>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  Sin activar
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{setup.branchName}</p>
            </DialogHeader>

            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="qr-street">Calle</Label>
                  <Input id="qr-street" value={streetName} disabled={locked} onChange={(e) => setStreetName(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="qr-number">Número</Label>
                  <Input
                    id="qr-number"
                    value={streetNumber}
                    disabled={locked}
                    onChange={(e) => setStreetNumber(e.target.value)}
                    className="tabular-nums"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="qr-city">{stateName === 'Capital Federal' ? 'Barrio' : 'Ciudad'}</Label>
                  <select
                    id="qr-city"
                    className={selectClass}
                    value={cityName}
                    disabled={locked || !stateName || citiesQuery.isLoading}
                    onChange={(e) => setCityName(e.target.value)}
                  >
                    <option value="">
                      {!stateName ? 'Elegí primero la provincia' : citiesQuery.isLoading ? 'Cargando...' : 'Elegí de la lista'}
                    </option>
                    {locked && cityName && !cities.includes(cityName) && <option value={cityName}>{cityName}</option>}
                    {cities.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="qr-state">Provincia</Label>
                  <select
                    id="qr-state"
                    className={selectClass}
                    value={stateName}
                    disabled={locked}
                    onChange={(e) => {
                      setStateName(e.target.value);
                      setCityName('');
                    }}
                  >
                    <option value="">Elegí la provincia</option>
                    {PROVINCES.map((p) => (
                      <option key={p} value={p}>
                        {p === 'Capital Federal' ? 'Ciudad Autónoma de Buenos Aires' : p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="-mt-1 text-xs text-muted-foreground">
                {locked
                  ? 'Esta sucursal ya está dada de alta en Mercado Pago con esta dirección. La caja se suma a esa sucursal.'
                  : 'Lo completamos con la dirección fiscal de la sucursal. Corregilo si no coincide.'}
              </p>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="qr-geo">Ubicación en el mapa</Label>
                <Input
                  id="qr-geo"
                  placeholder="Pegá el link o las coordenadas de Google Maps"
                  value={geoInput}
                  disabled={locked}
                  onChange={(e) => setGeoInput(e.target.value)}
                />
                <p
                  className={`rounded-md px-3 py-2 text-xs ${
                    coords.state === 'ok'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : coords.state === 'bad'
                        ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                        : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {coords.state === 'ok' ? (
                    <>
                      Ubicación detectada:{' '}
                      <span className="font-mono tabular-nums">
                        {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                      </span>
                    </>
                  ) : coords.state === 'bad' ? (
                    coords.message
                  ) : (
                    'Todavía no pegaste la ubicación.'
                  )}
                </p>
              </div>

              {!locked && (
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer font-semibold text-primary">¿Cómo copio la ubicación?</summary>
                  <ol className="mt-1.5 list-decimal space-y-0.5 pl-5">
                    <li>Abrí Google Maps y buscá la sucursal.</li>
                    <li>Mantené apretado (o hacé clic derecho) sobre el local.</li>
                    <li>
                      Tocá los números que aparecen arriba, por ejemplo <span className="font-mono">-34.60372, -58.38159</span>, y
                      se copian.
                    </li>
                    <li>Pegalos acá.</li>
                  </ol>
                </details>
              )}

              <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                Mercado Pago va a mostrar la sucursal con esta dirección en el mapa de su app.
              </p>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={activate.isPending || coords.state !== 'ok' || !addressComplete}
                onClick={() => activate.mutate()}
              >
                {activate.isPending ? 'Activando...' : 'Activar QR'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
