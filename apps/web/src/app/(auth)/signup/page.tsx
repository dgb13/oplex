'use client';

import { AuthCard } from '@/components/auth/AuthCard';
import { OAuthButtons } from '@/components/auth/OAuthButtons';
import { PasswordStrengthMeter } from '@/components/auth/PasswordStrengthMeter';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/input';
import { signup } from '@/lib/auth';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const signupSchema = z
  .object({
    tenantName: z.string().min(1, 'Ingresá el nombre de tu empresa'),
    ownerName: z.string().min(1, 'Ingresá tu nombre completo'),
    email: z.string().email('Ingresá un email válido'),
    password: z.string().min(8, 'Mínimo 8 caracteres'),
    confirmPassword: z.string(),
    acceptTerms: z.boolean().refine((v) => v, { message: 'Tenés que aceptar los términos' }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  });

type SignupForm = z.infer<typeof signupSchema>;

export default function SignupPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SignupForm>({
    resolver: zodResolver(signupSchema),
    defaultValues: { acceptTerms: false },
  });

  async function onSubmit(data: SignupForm) {
    try {
      const { tenantId, email } = await signup({
        tenantName: data.tenantName,
        ownerName: data.ownerName,
        email: data.email,
        password: data.password,
      });
      toast.success('Cuenta creada. Te mandamos un código para verificar tu email.');
      router.push(`/verify-email?tenantId=${tenantId}&email=${encodeURIComponent(email)}`);
    } catch {
      toast.error('No pudimos crear tu cuenta. Probá de nuevo en unos segundos.');
    }
  }

  return (
    <AuthCard
      title="Empezá gratis"
      subtitle="7 días de prueba, sin tarjeta"
      footer={
        <>
          ¿Ya tenés cuenta?{' '}
          <Link href="/login" className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
            Ingresá
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <FormField label="Nombre completo" htmlFor="ownerName" error={errors.ownerName?.message}>
          <Input
            id="ownerName"
            autoFocus
            autoComplete="name"
            placeholder="Tu nombre y apellido"
            hasError={!!errors.ownerName}
            {...register('ownerName')}
          />
        </FormField>

        <FormField label="Nombre de la empresa" htmlFor="tenantName" error={errors.tenantName?.message}>
          <Input
            id="tenantName"
            autoComplete="organization"
            placeholder="Tu Empresa SRL"
            hasError={!!errors.tenantName}
            {...register('tenantName')}
          />
        </FormField>

        <FormField label="Email" htmlFor="email" error={errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="vos@tuempresa.com"
            hasError={!!errors.email}
            {...register('email')}
          />
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

        <div>
          <label className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500"
              {...register('acceptTerms')}
            />
            Acepto los términos y condiciones y la política de privacidad
          </label>
          {errors.acceptTerms && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.acceptTerms.message}</p>
          )}
        </div>

        <Button type="submit" loading={isSubmitting}>
          Crear cuenta
        </Button>
        <OAuthButtons />
      </form>
    </AuthCard>
  );
}
