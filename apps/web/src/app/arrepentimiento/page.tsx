'use client';

import { PublicWebAnalytics } from '@/components/analytics/PublicWebAnalytics';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { legalApi, type LegalRequestReceipt } from '@/lib/legal';
import type { AxiosError } from 'axios';
import Link from 'next/link';
import { useState } from 'react';

/**
 * "Botón de arrepentimiento" (Res. 424/2020 de la Secretaría de Comercio
 * Interior): quien contrató como consumidor puede revocar la contratación
 * dentro de los 10 días corridos, sin costo, y recibe un número de trámite.
 * Pública, sin iniciar sesión.
 */
export default function WithdrawalPage() {
  const [form, setForm] = useState({ name: '', email: '', taxId: '', message: '' });
  const [receipt, setReceipt] = useState<LegalRequestReceipt | null>(null);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSending(true);
    try {
      setReceipt(
        await legalApi.withdrawal({
          name: form.name,
          email: form.email,
          taxId: form.taxId || undefined,
          message: form.message || undefined,
        }),
      );
    } catch (err) {
      const message = (err as AxiosError<{ message?: string | string[] }>).response?.data?.message;
      setError(Array.isArray(message) ? message.join(', ') : (message ?? 'No pudimos registrar el pedido. Probá de nuevo.'));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-background px-4 py-10 text-foreground">
      <PublicWebAnalytics />
      <div className="mx-auto flex max-w-xl flex-col gap-5">
        <Link href="/" className="text-sm font-semibold text-primary">
          ← Oplex
        </Link>
        <h1 className="text-2xl font-semibold">Botón de arrepentimiento</h1>
        <p className="text-sm text-muted-foreground">
          Si contrataste Oplex como consumidor, podés revocar la contratación dentro de los 10 días corridos desde que la
          hiciste, sin costo ni responsabilidad. Completá tus datos y te enviamos por email el número de trámite.
        </p>

        {receipt ? (
          <div className="rounded-xl border border-green-300 bg-green-50 p-5 text-green-900 dark:border-green-800 dark:bg-green-950/40 dark:text-green-200">
            <p className="font-semibold">Recibimos tu pedido.</p>
            <p className="mt-1 text-sm">
              Número de trámite: <b className="font-mono">{receipt.code}</b>
            </p>
            <p className="mt-2 text-sm">Te lo enviamos también por email. Guardalo: te vamos a responder a esa dirección.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4 rounded-xl border bg-card p-5">
            <label className="flex flex-col gap-1 text-sm" htmlFor="w-name">
              Nombre y apellido o razón social
              <Input id="w-name" required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-sm" htmlFor="w-email">
              Email con el que te registraste
              <Input id="w-email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-sm" htmlFor="w-cuit">
              CUIT (opcional)
              <Input id="w-cuit" value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-sm" htmlFor="w-msg">
              Comentario (opcional)
              <Textarea id="w-msg" rows={3} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
            </label>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={sending}>
              {sending ? 'Enviando...' : 'Revocar la contratación'}
            </Button>
          </form>
        )}

        <p className="text-xs text-muted-foreground">
          Ver los <Link href="/legal/terminos" className="underline">Términos y Condiciones</Link> (cláusula 16) y la{' '}
          <Link href="/legal/privacidad" className="underline">Política de Privacidad</Link>.
        </p>
      </div>
    </div>
  );
}
