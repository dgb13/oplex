'use client';

import type { ReactNode } from 'react';
import { Label } from './label';

interface FormFieldProps {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}

/** Label + input slot + error/hint line - the one wrapper every auth form
 * below reuses instead of re-copying the label/error markup per field
 * (see the repeated inputClass pattern in CompanyFormModal.tsx, which this
 * module deliberately doesn't perpetuate). */
export function FormField({ label, htmlFor, error, hint, children }: FormFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
