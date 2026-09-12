'use client';

import { AuthCard } from '@/components/auth/AuthCard';
import { OAuthButtons } from '@/components/auth/OAuthButtons';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/input';
import { getAuthErrorBody, login, resolveTenant, type TenantCandidate } from '@/lib/auth';
import { getPostLoginRedirect } from '@/lib/jwt';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const emailSchema = z.object({ email: z.string().email('Ingresá un email válido') });
type EmailForm = z.infer<typeof emailSchema>;

const passwordSchema = z.object({
  password: z.string().min(1, 'Ingresá tu contraseña'),
  rememberMe: z.boolean().optional(),
});
type PasswordForm = z.infer<typeof passwordSchema>;

type Phase = 'email' | 'pick-tenant' | 'password';

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>('email');
  const [email, setEmail] = useState('');
  const [candidates, setCandidates] = useState<TenantCandidate[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const emailForm = useForm<EmailForm>({ resolver: zodResolver(emailSchema) });
  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { rememberMe: false },
  });

  async function onSubmitEmail(data: EmailForm) {
    setResolving(true);
    try {
      const found = await resolveTenant(data.email);
      setEmail(data.email);
      if (found.length === 0) {
        emailForm.setError('email', { message: 'No encontramos ninguna cuenta con ese email' });
        return;
      }
      if (found.length === 1) {
        setTenantId(found[0].tenantId);
        setPhase('password');
      } else {
        setCandidates(found);
        setPhase('pick-tenant');
      }
    } catch {
      emailForm.setError('email', { message: 'No pudimos verificar ese email, probá de nuevo' });
    } finally {
      setResolving(false);
    }
  }

  function pickTenant(id: string) {
    setTenantId(id);
    setPhase('password');
  }

  async function onSubmitPassword(data: PasswordForm) {
    if (!tenantId) return;
    try {
      const { accessToken } = await login({ tenantId, email, password: data.password, rememberMe: data.rememberMe });
      localStorage.setItem('token', accessToken);
      localStorage.setItem('tenantId', tenantId);
      // Same reasoning as before the redesign: never reuse cached queries
      // (e.g. mustChangePassword) between two different logins.
      queryClient.clear();
      router.push(getPostLoginRedirect(accessToken));
    } catch (err) {
      const body = getAuthErrorBody(err);
      if (body?.code === 'EMAIL_NOT_VERIFIED') {
        router.push(`/verify-email?tenantId=${tenantId}&email=${encodeURIComponent(email)}`);
        return;
      }
      // A diferencia de contraseña incorrecta (mensaje genérico a propósito,
      // anti-enumeración), una cuenta suspendida sí muestra el motivo real -
      // no hay nada que enumerar, el usuario ya demostró conocer el email y
      // la contraseña correctos.
      if (body?.code === 'ACCOUNT_SUSPENDED' && body.message) {
        passwordForm.setError('password', { message: body.message });
        return;
      }
      passwordForm.setError('password', { message: 'Credenciales inválidas' });
    }
  }

  function backToEmail() {
    setPhase('email');
    setTenantId(null);
    setCandidates([]);
    passwordForm.reset();
  }

  return (
    <AuthCard
      title="Ingresá a tu cuenta"
      subtitle={phase === 'email' ? 'Con tu email, encontramos tu empresa' : email}
      footer={
        <>
          ¿No tenés cuenta?{' '}
          <Link href="/signup" className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
            Empezá gratis
          </Link>
        </>
      }
    >
      {phase === 'email' && (
        <form onSubmit={emailForm.handleSubmit(onSubmitEmail)} className="flex flex-col gap-4" noValidate>
          <FormField label="Email" htmlFor="email" error={emailForm.formState.errors.email?.message}>
            <Input
              id="email"
              type="email"
              autoFocus
              autoComplete="email"
              placeholder="owner@tuempresa.com"
              hasError={!!emailForm.formState.errors.email}
              {...emailForm.register('email')}
            />
          </FormField>
          <Button type="submit" loading={resolving}>
            Continuar
          </Button>
          <OAuthButtons />
        </form>
      )}

      {phase === 'pick-tenant' && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Ese email pertenece a más de una empresa. Elegí con cuál querés ingresar:
          </p>
          {candidates.map((c) => (
            <button
              key={c.tenantId}
              onClick={() => pickTenant(c.tenantId)}
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-3 text-left text-sm font-medium text-slate-900 dark:text-slate-100 hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition"
            >
              {c.tenantName}
            </button>
          ))}
          <button
            onClick={backToEmail}
            className="mt-1 text-center text-sm text-slate-500 dark:text-slate-400 hover:underline"
          >
            Usar otro email
          </button>
        </div>
      )}

      {phase === 'password' && (
        <form onSubmit={passwordForm.handleSubmit(onSubmitPassword)} className="flex flex-col gap-4" noValidate>
          <FormField label="Contraseña" htmlFor="password" error={passwordForm.formState.errors.password?.message}>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoFocus
                autoComplete="current-password"
                hasError={!!passwordForm.formState.errors.password}
                className="pr-10"
                {...passwordForm.register('password')}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </FormField>

          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500"
                {...passwordForm.register('rememberMe')}
              />
              Recordarme
            </label>
            <Link href="/forgot-password" className="text-indigo-600 dark:text-indigo-400 hover:underline">
              ¿Olvidaste tu contraseña?
            </Link>
          </div>

          <Button type="submit" loading={passwordForm.formState.isSubmitting}>
            Ingresar
          </Button>
          <button
            type="button"
            onClick={backToEmail}
            className="text-center text-sm text-slate-500 dark:text-slate-400 hover:underline"
          >
            Usar otro email
          </button>
        </form>
      )}
    </AuthCard>
  );
}
