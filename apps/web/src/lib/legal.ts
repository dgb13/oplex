import { api } from './api';

// Contrato de uso (textos en apps/web/legal/*.md). La versión vigente la
// informa la API en el perfil (currentTermsVersion) - no se repite acá.
export const LEGAL_DOCS = [
  { slug: 'terminos', title: 'Términos y Condiciones', file: 'terminos-y-condiciones.md' },
  { slug: 'privacidad', title: 'Política de Privacidad', file: 'politica-de-privacidad.md' },
  { slug: 'tratamiento-de-datos', title: 'Acuerdo de Tratamiento de Datos', file: 'acuerdo-tratamiento-datos.md' },
] as const;

export type LegalDocSlug = (typeof LEGAL_DOCS)[number]['slug'];

export interface LegalRequestReceipt {
  code: string;
  createdAt: string;
}

export const legalApi = {
  accept: () => api.post<{ version: string; acceptedAt: string }>('/legal/accept').then((r) => r.data),
  withdrawal: (input: { name: string; email: string; taxId?: string; message?: string }) =>
    api.post<LegalRequestReceipt>('/legal/withdrawal', input).then((r) => r.data),
  cancellation: (message?: string) =>
    api.post<LegalRequestReceipt>('/legal/cancellation', { message }).then((r) => r.data),
};
