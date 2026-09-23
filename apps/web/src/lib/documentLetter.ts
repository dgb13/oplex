import type { TenantTaxCondition } from '@/lib/tenantSettings';

export type DocumentLetter = 'A' | 'B' | 'C' | 'M';

export interface DocumentLetterSuggestion {
  letter: DocumentLetter | null;
  /** true = la letra está fiscalmente determinada sin ambigüedad (no hay
   * otra opción legalmente válida dado lo que sabemos) - el selector se
   * bloquea. false = sugerencia conservadora, el usuario puede corregirla
   * (ej. no conocemos la condición IVA real del cliente todavía). */
  locked: boolean;
  reason: string;
}

/**
 * Deriva la letra de comprobante (A/B/C) según las reglas reales de AFIP:
 * - Emisor Monotributo/Exento → siempre C, sin importar el cliente.
 * - Emisor Responsable Inscripto + cliente Responsable Inscripto → A.
 * - Emisor Responsable Inscripto + cliente sin CUIT (Consumidor Final),
 *   Monotributo o Exento → B.
 * - Emisor Responsable Inscripto + cliente con CUIT pero condición IVA
 *   desconocida (nunca se corrió "Buscar en AFIP" en su ficha) → se sugiere
 *   B sin bloquear, porque asumir A y estar equivocado es el error más
 *   grave (discriminar IVA a quien no puede tomarlo) - B es siempre un
 *   documento válido aunque termine siendo "de más".
 * Letra M (RI facturando a monotributista con retención) queda fuera de
 * esta derivación a propósito - régimen especial, sigue siendo elección
 * manual.
 */
export function suggestDocumentLetter(
  ownTaxCondition: TenantTaxCondition | null,
  customerTaxId: string | null,
  customerTaxCondition: string | null,
): DocumentLetterSuggestion {
  if (!ownTaxCondition) {
    return {
      letter: null,
      locked: false,
      reason:
        'Configurá la condición IVA de tu empresa en Preferencias para que el sistema sugiera la letra automáticamente.',
    };
  }

  if (ownTaxCondition === 'MONOTRIBUTO' || ownTaxCondition === 'EXENTO') {
    return {
      letter: 'C',
      locked: true,
      reason: 'Tu empresa es Monotributo/Exento: siempre corresponde Factura C.',
    };
  }

  // ownTaxCondition === 'RESPONSABLE_INSCRIPTO'
  if (!customerTaxId) {
    return {
      letter: 'B',
      locked: true,
      reason: 'Cliente sin CUIT (Consumidor Final): corresponde Factura B.',
    };
  }

  const normalized = (customerTaxCondition ?? '').toLowerCase();
  if (normalized.includes('responsable inscripto')) {
    return { letter: 'A', locked: true, reason: 'Cliente Responsable Inscripto: corresponde Factura A.' };
  }
  if (normalized.includes('monotribut') || normalized.includes('exent')) {
    return { letter: 'B', locked: true, reason: 'Cliente Monotributo/Exento: corresponde Factura B.' };
  }

  return {
    letter: 'B',
    locked: false,
    reason:
      'No se conoce la condición IVA de este cliente (usá "Buscar en ARCA" en su ficha) - se sugiere Factura B por defecto. Cambiá a A sólo si confirmás que es Responsable Inscripto.',
  };
}
