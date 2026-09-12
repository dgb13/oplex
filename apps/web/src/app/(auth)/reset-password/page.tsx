'use client';

import { AuthCard } from '@/components/auth/AuthCard';
import { PasswordStrengthMeter } from '@/components/auth/PasswordStrengthMeter';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/input';
import { getAuthErrorBody, resetPassword } from '@/lib/auth';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const schema = z
  .object({
    newPassword: z.string().min(8, 'Mínimo 8 caracteres'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  });
type Form = z.infer<typeof schema>;

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const tenantId = searchParams.get('tenantId') ?? '';
  const token = searchParams.get('token') ?? '';

  const [done, setDone] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  async function onSubmit(data: Form) {
    try {
      await resetPassword({ tenantId, token, newPassword: data.newPassword });
      setDone(true);
    } catch (err) {
      setError('newPassword', {
        message: getAuthErrorBody(err)?.message ?? 'El link de recuperación es inválido o expiró',
      });
    }
  }

  if (!tenantId || !token) {
    return (
      <AuthCard title="Link inválido">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Este link de recuperación no es válido. Pedí uno nuevo desde{' '}
          <Link href="/forgot-password" className="text-indigo-600 dark:text-indigo-400 hover:underline">
            ¿Olvidaste tu contraseña?
          </Link>
        </p>
      </AuthCard>
    );
  }

  if (done) {
    return (
      <AuthCard title="Contraseña actualizada">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Ya podés ingresar con tu contraseña nueva.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          Ir a ingresar
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Elegí una contraseña nueva">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <FormField label="Contraseña nueva" htmlFor="newPassword" error={errors.newPassword?.message}>
          <div className="relative">
            <Input
              id="newPassword"
              type={showPassword ? 'text' : 'password'}
              autoFocus
              autoComplete="new-password"
              hasError={!!errors.newPassword}
              className="pr-10"
              {...register('newPassword')}
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
          <PasswordStrengthMeter password={watch('newPassword') ?? ''} />
        </FormField>

        <FormField label="Confirmar contraseña" htmlFor="confirmPassword" error={errors.confirmPassword?.message}>
          <Input
            id="confirmPassword"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            hasError={!!errors.confirmPassword}
            {...register('confirmPassword')}
          />
        </FormField>

        <Button type="submit" loading={isSubmitting}>
          Guardar contraseña
        </Button>
      </form>
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
