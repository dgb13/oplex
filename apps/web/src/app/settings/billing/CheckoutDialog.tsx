'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  billingApi,
  computeSubscriptionCharge,
  formatPesos,
  SUBSCRIPTION_MONTH_OPTIONS,
  type OplexBankDetails,
  type Plan,
} from '@/lib/subscriptions';
import { useMutation } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

function errorMessage(err: unknown, fallback: string): string {
  const message = (err as AxiosError<{ message?: string | string[] }> | undefined)?.response?.data?.message;
  if (!message) return fallback;
  return Array.isArray(message) ? message.join(', ') : message;
}

/** Contratar o renovar un plan pago (mockup aprobado, más el pago anual con
 * descuento pedido después). Débito automático con Mercado Pago queda
 * visible pero deshabilitado hasta la parte 4. */
export default function CheckoutDialog({
  plan,
  oplexBank,
  onClose,
  onReported,
}: {
  plan: Plan;
  oplexBank: OplexBankDetails;
  onClose: () => void;
  onReported: () => void;
}) {
  const [step, setStep] = useState<'pick' | 'transfer'>('pick');
  const [months, setMonths] = useState<number>(1);
  const [reference, setReference] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const charge = computeSubscriptionCharge(plan, 'TRANSFER', months);
  const annualDiscount = Number(plan.annualDiscountPercent);
  const debitDiscount = Number(plan.debitDiscountPercent);
  const bankReady = Boolean(oplexBank.cbu || oplexBank.alias);

  const report = useMutation({
    mutationFn: async () => {
      const receiptUrl = file ? (await billingApi.uploadReceipt(file)).receiptUrl : undefined;
      return billingApi.reportTransfer({ planKey: plan.key, months, reference: reference.trim() || undefined, receiptUrl });
    },
    onSuccess: onReported,
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{step === 'pick' ? `Contratar Plan ${plan.name}` : `Transferir ${formatPesos(charge.total)}`}</DialogTitle>
          <DialogDescription>
            {step === 'pick'
              ? 'Los precios de los planes son sin IVA: al total se le suma el 21%.'
              : 'Cuando hagas la transferencia, avisanos acá. La confirmamos dentro del día hábil.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'pick' ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Cómo querés pagar</p>
              <div className="flex cursor-not-allowed gap-3 rounded-lg border p-3 opacity-60">
                <input type="radio" disabled className="mt-1" aria-label="Tarjeta con débito automático" />
                <div>
                  <p className="text-sm font-semibold">
                    Tarjeta con débito automático{' '}
                    {debitDiscount > 0 && <span className="text-green-600 dark:text-green-400">· {debitDiscount}% off</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">Con Mercado Pago, todos los meses. Disponible muy pronto.</p>
                </div>
              </div>
              <label className="flex gap-3 rounded-lg border border-primary bg-primary/5 p-3" htmlFor="checkout-transfer">
                <input id="checkout-transfer" type="radio" checked readOnly className="mt-1 accent-primary" />
                <div>
                  <p className="text-sm font-semibold">Transferencia bancaria</p>
                  <p className="text-xs text-muted-foreground">
                    Pagás 1, 3, 6 o 12 meses por adelantado.
                    {annualDiscount > 0 && ` Pagando el año entero tenés ${annualDiscount}% de descuento.`}
                  </p>
                </div>
              </label>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {SUBSCRIPTION_MONTH_OPTIONS.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={months === m}
                  onClick={() => setMonths(m)}
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    months === m ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {m === 12 ? `1 año${annualDiscount > 0 ? ` · ${annualDiscount}% off` : ''}` : `${m} ${m === 1 ? 'mes' : 'meses'}`}
                </button>
              ))}
            </div>

            <ChargeSummary planName={plan.name} months={months} charge={charge} />

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancelar
              </Button>
              <Button onClick={() => setStep('transfer')}>Ver datos para transferir</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {bankReady ? (
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 rounded-lg bg-muted/60 p-3 text-sm">
                {oplexBank.holder && <Row label="Titular" value={oplexBank.holder} />}
                {oplexBank.cuit && <Row label="CUIT" value={oplexBank.cuit} />}
                {oplexBank.bankName && <Row label="Banco" value={oplexBank.bankName} />}
                {oplexBank.cbu && <Row label="CBU" value={oplexBank.cbu} mono />}
                {oplexBank.alias && <Row label="Alias" value={oplexBank.alias} mono />}
                <Row label="Importe" value={`${formatPesos(charge.total)} · ${months === 12 ? '1 año' : `${months} ${months === 1 ? 'mes' : 'meses'}`} del Plan ${plan.name}`} />
              </dl>
            ) : (
              <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                Todavía no cargamos los datos bancarios de Oplex. Escribinos y te los pasamos.
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground" htmlFor="checkout-reference">
                N° de operación
                <Input id="checkout-reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ej. 00412-88" />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground" htmlFor="checkout-receipt">
                Comprobante (JPG, PNG o PDF)
                <Input
                  id="checkout-receipt"
                  type="file"
                  accept="image/png,image/jpeg,application/pdf"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Mientras lo confirmamos, tu cuenta sigue funcionando 3 días aunque se haya vencido.
            </p>

            {report.isError && <p className="text-sm text-destructive">{errorMessage(report.error, 'No pudimos registrar el aviso')}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setStep('pick')} disabled={report.isPending}>
                Volver
              </Button>
              <Button onClick={() => report.mutate()} disabled={report.isPending || (!reference.trim() && !file)}>
                {report.isPending ? 'Avisando...' : 'Ya transferí, avisar'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ChargeSummary({
  planName,
  months,
  charge,
}: {
  planName: string;
  months: number;
  charge: ReturnType<typeof computeSubscriptionCharge>;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-muted/60 p-3 text-sm tabular-nums">
      <div className="flex justify-between">
        <span>
          Plan {planName}
          {months > 1 ? ` × ${months} meses` : ''}
        </span>
        <span>{formatPesos(charge.listPrice)}</span>
      </div>
      {charge.discountAmount > 0 && (
        <div className="flex justify-between text-green-600 dark:text-green-400">
          <span>Descuento {charge.discountPercent}%</span>
          <span>-{formatPesos(charge.discountAmount)}</span>
        </div>
      )}
      <div className="flex justify-between">
        <span>IVA 21%</span>
        <span>{formatPesos(charge.vatAmount)}</span>
      </div>
      <div className="mt-1 flex justify-between border-t pt-1.5 font-semibold">
        <span>Total a transferir</span>
        <span>{formatPesos(charge.total)}</span>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? 'font-mono' : ''}>{value}</dd>
    </>
  );
}
