'use client';

import { AuthCard } from '@/components/auth/AuthCard';
import { Button } from '@/components/ui/button';
import { getAuthErrorBody, resendCode, verifyEmail } from '@/lib/auth';
import { getPostLoginRedirect } from '@/lib/jwt';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { toast } from 'sonner';

const RESEND_COOLDOWN_SECONDS = 60;

function VerifyEmailForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const tenantId = searchParams.get('tenantId') ?? '';
  const email = searchParams.get('email') ?? '';

  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!/^\d{6}$/.test(code)) {
      setError('Ingresá los 6 dígitos del código');
      return;
    }
    setSubmitting(true);
    try {
      const { accessToken } = await verifyEmail({ tenantId, email, code });
      localStorage.setItem('token', accessToken);
      localStorage.setItem('tenantId', tenantId);
      queryClient.clear();
      router.push(getPostLoginRedirect(accessToken));
    } catch (err) {
      setError(getAuthErrorBody(err)?.message ?? 'Código inválido o expirado');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (cooldown > 0) return;
    try {
      await resendCode({ tenantId, email });
      toast.success('Te mandamos un código nuevo');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      toast.error(getAuthErrorBody(err)?.message ?? 'Esperá un momento antes de pedir otro código');
    }
  }

  if (!tenantId || !email) {
    return (
      <AuthCard title="Verificá tu email">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Este link no es válido. Volvé a intentar el registro desde el principio.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Verificá tu email" subtitle={`Te mandamos un código de 6 dígitos a ${email}`}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <input
          type="text"
          inputMode="numeric"
          autoFocus
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          placeholder="000000"
          className={`w-full rounded-lg border bg-white/80 dark:bg-slate-900/60 px-3 py-3 text-center text-2xl font-semibold tracking-[0.5em] text-slate-900 dark:text-slate-100 outline-none transition focus:ring-2 focus:ring-indigo-500/40 ${
            error
              ? 'border-red-400 dark:border-red-500'
              : 'border-slate-300 dark:border-slate-700 focus:border-indigo-500'
          }`}
        />
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

        <Button type="submit" loading={submitting}>
          Verificar
        </Button>

        <button
          type="button"
          onClick={handleResend}
          disabled={cooldown > 0}
          className="text-center text-sm text-indigo-600 dark:text-indigo-400 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline dark:disabled:text-slate-500"
        >
          {cooldown > 0 ? `Reenviar código (${cooldown}s)` : 'Reenviar código'}
        </button>
      </form>
    </AuthCard>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailForm />
    </Suspense>
  );
}
