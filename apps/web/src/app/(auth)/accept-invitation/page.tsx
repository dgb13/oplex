'use client';

import { AuthCard } from '@/components/auth/AuthCard';
import { PasswordStrengthMeter } from '@/components/auth/PasswordStrengthMeter';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/input';
import { getAuthErrorBody } from '@/lib/auth';
import { teamApi } from '@/lib/team';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const schema = z
  .object({
    name: z.string().min(1, 'Ingresá tu nombre'),
    password: z.string().min(8, 'Mínimo 8 caracteres'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  });
type Form = z.infer<typeof schema>;

function AcceptInvitationForm() {
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
      await teamApi.acceptInvitation({ tenantId, token, name: data.name, password: data.password });
      setDone(true);
    } catch (err) {
      setError('password', {
        message: getAuthErrorBody(err)?.message ?? 'La invitación es inválida o expiró',
      });
    }
  }

  if (!tenantId || !token) {
    return (
      <AuthCard title="Link inválido">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Este link de invitación no es válido. Pedile a quien te invitó que te mande uno nuevo, o{' '}
          <Link href="/login" className="text-indigo-600 dark:text-indigo-400 hover:underline">
            iniciá sesión
          </Link>{' '}
          si ya tenés cuenta.
        </p>
      </AuthCard>
    );
  }

  if (done) {
    return (
      <AuthCard title="Listo, ya sos parte del equipo">
        <p className="text-sm text-slate-600 dark:text-slate-400">Ya podés ingresar con tu email y contraseña.</p>
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
    <AuthCard title="Sumate al equipo" subtitle="Elegí tu nombre y una contraseña para terminar de crear tu cuenta">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <FormField label="Tu nombre" htmlFor="name" error={errors.name?.message}>
          <Input id="name" type="text" autoFocus autoComplete="name" hasError={!!errors.name} {...register('name')} />
        </FormField>

        <FormField label="Contraseña" htmlFor="password" error={errors.password?.message}>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              hasError={!!errors.password}
              className="pr-10"
              {...register('password')}
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
          <PasswordStrengthMeter password={watch('password') ?? ''} />
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
          Crear mi cuenta
        </Button>
      </form>
    </AuthCard>
  );
}

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={null}>
      <AcceptInvitationForm />
    </Suspense>
  );
}
