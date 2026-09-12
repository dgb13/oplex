'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { invoicingApi, type Invoice } from '@/lib/invoicing';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  invoice: Invoice;
  onClose: () => void;
}

const inputClass =
  'h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

const METHODS = ['CASH', 'BANK_TRANSFER', 'CARD', 'CHECK'] as const;
const METHOD_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  BANK_TRANSFER: 'Transferencia',
  CARD: 'Tarjeta',
  CHECK: 'Cheque',
};

export default function ReceiptModal({ invoice, onClose }: Props) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(invoice.balanceDue);
  const [method, setMethod] = useState<(typeof METHODS)[number]>('CASH');
  const [checkNumber, setCheckNumber] = useState('');
  const [checkBankName, setCheckBankName] = useState('');
  const [checkDrawerCuit, setCheckDrawerCuit] = useState('');
  const [checkFormat, setCheckFormat] = useState<'PHYSICAL' | 'ECHEQ'>('PHYSICAL');
  const [checkIssueDate, setCheckIssueDate] = useState('');
  const [checkDueDate, setCheckDueDate] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      invoicingApi.recordReceipt({
        invoiceId: invoice.id,
        amount: Number(amount),
        method,
        check:
          method === 'CHECK'
            ? {
                number: checkNumber,
                bankName: checkBankName,
                drawerCuit: checkDrawerCuit || undefined,
                format: checkFormat,
                issueDate: checkIssueDate,
                dueDate: checkDueDate,
              }
            : undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      void queryClient.invalidateQueries({ queryKey: ['checks'] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo registrar el cobro';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (Number(amount) <= 0) {
      setError('El monto debe ser mayor a cero');
      return;
    }
    if (method === 'CHECK') {
      if (!checkNumber.trim() || !checkBankName.trim() || !checkIssueDate || !checkDueDate) {
        setError('Completá número, banco, fecha de emisión y de vencimiento del cheque');
        return;
      }
    }
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 text-card-foreground shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Registrar cobro</h2>
          <button onClick={onClose} className="text-muted-foreground transition hover:text-foreground">
            ✕
          </button>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          {invoice.documentLetter}-{invoice.number} · saldo pendiente ${invoice.balanceDue}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">Monto</label>
            <Input type="number" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">Método</label>
            <select
              className={inputClass}
              value={method}
              onChange={(e) => setMethod(e.target.value as typeof method)}
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </div>
          {method === 'CHECK' && (
            <div className="flex flex-col gap-3 rounded-lg border p-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Número
                  <Input value={checkNumber} onChange={(e) => setCheckNumber(e.target.value)} />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Banco
                  <Input value={checkBankName} onChange={(e) => setCheckBankName(e.target.value)} />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  CUIT librador (opcional)
                  <Input value={checkDrawerCuit} onChange={(e) => setCheckDrawerCuit(e.target.value)} />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Formato
                  <select
                    className={inputClass}
                    value={checkFormat}
                    onChange={(e) => setCheckFormat(e.target.value as typeof checkFormat)}
                  >
                    <option value="PHYSICAL">Físico</option>
                    <option value="ECHEQ">eCheq</option>
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Fecha de emisión
                  <Input type="date" value={checkIssueDate} onChange={(e) => setCheckIssueDate(e.target.value)} />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Fecha de vencimiento
                  <Input type="date" value={checkDueDate} onChange={(e) => setCheckDueDate(e.target.value)} />
                </label>
              </div>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Registrando...' : 'Registrar'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
