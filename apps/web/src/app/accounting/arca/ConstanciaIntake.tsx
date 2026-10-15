'use client';

import { constanciaApi, type ConstanciaReading } from '@/lib/tenantSettings';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useRef, useState } from 'react';
import { ConstanciaExample } from './ConstanciaExample';

// Mismo enlace que ArcaConstanciaLinkService.DEFAULT_CONSTANCIA_URL, por si
// la API no responde: el botón nunca queda sin destino.
const FALLBACK_URL = 'https://seti.afip.gob.ar/padron-puc-constancia-internet/ConsultaConstanciaAction.do';

function apiError(err: unknown, fallback: string): string {
  const message = (err as AxiosError<{ message?: string | string[] }>)?.response?.data?.message;
  return Array.isArray(message) ? message.join(', ') : (message ?? fallback);
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[24px_1fr] gap-2.5 text-[13.5px] leading-normal text-muted-foreground">
      <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full border bg-muted text-[11.5px] font-extrabold text-foreground">
        {n}
      </span>
      <span>{children}</span>
    </li>
  );
}

const B = ({ children }: { children: React.ReactNode }) => <b className="text-foreground">{children}</b>;

/**
 * Paso 1 de Conexión con ARCA, constancia primero (mockup aprobado el
 * 2026-10-15): instructivo para sacar la Constancia de Inscripción en la
 * consulta pública de ARCA, una constancia de ejemplo y la zona para
 * subirla. La lectura la hace la IA (POST /arca/constancia/read); el
 * archivo no se guarda.
 */
export function ConstanciaIntake({
  cuit,
  onRead,
  onUseCuit,
}: {
  /** Sólo dígitos; null si la empresa todavía no tiene CUIT cargado. */
  cuit: string | null;
  onRead: (reading: ConstanciaReading, fileName: string) => string | null;
  onUseCuit: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [problem, setProblem] = useState('');
  const [copied, setCopied] = useState(false);
  const { data: link } = useQuery({ queryKey: ['constancia-link'], queryFn: constanciaApi.link, staleTime: 3_600_000 });

  const read = useMutation({
    mutationFn: (file: File) => constanciaApi.read(file).then((reading) => ({ reading, fileName: file.name })),
    onMutate: () => setProblem(''),
    onSuccess: ({ reading, fileName }) => {
      if (!reading.isConstancia) {
        setProblem('Ese archivo no parece una constancia de ARCA. Revisá que sea la que sacaste en el paso 3.');
        return;
      }
      setProblem(onRead(reading, fileName) ?? '');
    },
  });

  const pick = (file: File | undefined) => {
    if (file) read.mutate(file);
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 max-w-[70ch] text-sm leading-normal text-muted-foreground">
        Subí tu <B>Constancia de Inscripción</B> de ARCA y completamos todo solos: razón social, condición frente al IVA, domicilio
        fiscal, Ingresos Brutos e inicio de actividades. Se saca en un minuto y no hace falta clave fiscal.
      </p>

      <div className="grid grid-cols-1 items-start gap-[18px] md:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-3.5">
          <ol className="m-0 flex list-none flex-col gap-3 p-0">
            <Step n={1}>
              Tocá <B>Abrir la consulta en ARCA</B>. Se abre en otra pestaña.
            </Step>
            <Step n={2}>
              En <B>CUIT del Contribuyente</B> escribí {cuit ? 'tu CUIT sin guiones:' : 'el CUIT de tu empresa sin guiones.'}
              {cuit && (
                <>
                  {' '}
                  <code className="rounded-[5px] border bg-muted px-1.5 py-px font-mono text-[12.5px] text-foreground">{cuit}</code>
                  <button
                    type="button"
                    className="ml-1 rounded-full border bg-card px-2 py-px text-[11px] font-bold text-primary"
                    onClick={() => {
                      void navigator.clipboard
                        ?.writeText(cuit)
                        .then(() => setCopied(true))
                        .catch(() => setCopied(false));
                    }}
                  >
                    {copied ? '✓ Copiado' : 'Copiar'}
                  </button>
                </>
              )}
            </Step>
            <Step n={3}>
              Resolvé el código de seguridad (podés elegir <B>Texto distorsionado</B> o <B>Cálculo matemático</B>), escribilo en{' '}
              <B>Ingresá los caracteres visibles</B> y tocá <B>Consultar</B>.
            </Step>
            <Step n={4}>
              ARCA te muestra la constancia. Tocá <B>Imprimir</B> (o{' '}
              <code className="rounded-[5px] border bg-muted px-1.5 py-px font-mono text-[12.5px] text-foreground">Ctrl + P</code>
              ), elegí <B>Guardar como PDF</B> y subí ese archivo acá abajo. También sirve una foto.
            </Step>
          </ol>

          <a
            href={link?.url ?? FALLBACK_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-max items-center gap-1.5 rounded-[9px] bg-primary px-3.5 py-2.5 text-sm font-bold text-primary-foreground transition hover:bg-primary/90"
          >
            Abrir la consulta en ARCA ↗
          </a>

          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              pick(e.dataTransfer.files[0]);
            }}
            className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 border-dashed p-5 text-center text-muted-foreground transition hover:border-primary ${
              dragOver ? 'border-primary bg-primary/5' : ''
            }`}
          >
            <b className="text-[15px] text-foreground">{read.isPending ? 'Leyendo la constancia...' : 'Arrastrá la constancia acá'}</b>
            <span>
              o <span className="rounded-full border bg-card px-2 py-px text-[11px] font-bold text-primary">elegí el archivo</span> · PDF o foto
            </span>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                pick(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>
          {read.isError && <p className="m-0 text-sm text-destructive">✕ {apiError(read.error, 'No se pudo leer la constancia.')}</p>}
          {problem && <p className="m-0 text-sm text-destructive">✕ {problem}</p>}

          <div className="border-t pt-3 text-[13px] text-muted-foreground">
            ¿No podés sacarla ahora?{' '}
            <button type="button" onClick={onUseCuit} className="font-semibold text-primary underline underline-offset-2">
              Cargar sólo con el CUIT
            </button>{' '}
            (vas a tener que completar Ingresos Brutos e inicio de actividades vos).
          </div>
        </div>

        <ConstanciaExample />
      </div>
    </div>
  );
}
