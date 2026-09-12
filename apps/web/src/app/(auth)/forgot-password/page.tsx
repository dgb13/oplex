'use client';

import { AuthCard } from '@/components/auth/AuthCard';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/input';
import { forgotPassword } from '@/lib/auth';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const schema = z.object({ email: z.string().email('Ingresá un email válido') });
type Form = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  async function onSubmit(data: Form) {
    // La API siempre responde ok:true, sin importar si el email existe o
    // no (ver AuthService.forgotPassword) - por eso este catch nunca
    // debería dispararse en un uso normal, pero si la red falla igual
    // mostramos el mismo mensaje genérico, no un error distinto.
    try {
      await forgotPassword(data.email);
    } finally {
      setSent(true);
    }
  }

  if (sent) {
    return (
      <AuthCard title="Revisá tu email">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Si existe una cuenta con ese email, te mandamos instrucciones para elegir una contraseña
          nueva.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          Volver a ingresar
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="¿Olvidaste tu contraseña?"
      subtitle="Te mandamos un link para elegir una nueva"
      footer={
        <Link href="/login" className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
          Volver a ingresar
        </Link>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <FormField label="Email" htmlFor="email" error={errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoFocus
            autoComplete="email"
            placeholder="owner@tuempresa.com"
            hasError={!!errors.email}
            {...register('email')}
          />
        </FormField>
        <Button type="submit" loading={isSubmitting}>
          Enviar instrucciones
        </Button>
      </form>
    </AuthCard>
  );
}
