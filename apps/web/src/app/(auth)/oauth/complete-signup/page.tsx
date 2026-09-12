'use client';

import { AuthCard } from '@/components/auth/AuthCard';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/input';
import { getAuthErrorBody, oauthCompleteSignup } from '@/lib/auth';
import { getPostLoginRedirect } from '@/lib/jwt';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const schema = z.object({
  tenantName: z.string().min(1, 'Ingresá el nombre de tu empresa'),
  taxId: z.string().optional(),
});
type Form = z.infer<typeof schema>;

function CompleteSignupForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const oauthSignupToken = searchParams.get('oauthSignupToken') ?? '';

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  async function onSubmit(data: Form) {
    try {
      const { accessToken } = await oauthCompleteSignup({
        oauthSignupToken,
        tenantName: data.tenantName,
        taxId: data.taxId || undefined,
      });
      localStorage.setItem('token', accessToken);
      queryClient.clear();
      router.push(getPostLoginRedirect(accessToken));
    } catch (err) {
      setError('tenantName', {
        message: getAuthErrorBody(err)?.message ?? 'No pudimos crear tu cuenta, volvé a intentar desde el login',
      });
    }
  }

  if (!oauthSignupToken) {
    return (
      <AuthCard title="Link inválido">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Volvé a intentar el ingreso con Google o Microsoft desde el login.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Ya casi terminamos" subtitle="Contanos el nombre de tu empresa para crear tu cuenta">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <FormField label="Nombre de la empresa" htmlFor="tenantName" error={errors.tenantName?.message}>
          <Input
            id="tenantName"
            autoFocus
            autoComplete="organization"
            placeholder="Tu Empresa SRL"
            hasError={!!errors.tenantName}
            {...register('tenantName')}
          />
        </FormField>
        <Button type="submit" loading={isSubmitting}>
          Crear cuenta
        </Button>
      </form>
    </AuthCard>
  );
}

export default function OAuthCompleteSignupPage() {
  return (
    <Suspense fallback={null}>
      <CompleteSignupForm />
    </Suspense>
  );
}
