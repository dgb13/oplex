export type AfipPersonType = 'FISICA' | 'JURIDICA';

export interface AfipPadronData {
  cuit: string;
  personType: AfipPersonType;
  /** Razón social (jurídica) o nombre completo (física). */
  name: string;
  /** Best-effort label ("Responsable Inscripto", "Monotributo (...)") derived
   * from the padrón response - not a closed enum, AFIP's own categories
   * change over time. Not persisted anywhere, only shown to the user. */
  taxCondition: string | null;
  fiscalAddress: string | null;
  /** Condición frente al IVA ya interpretada (null = no se pudo deducir). */
  ivaCondition?: 'RESPONSABLE_INSCRIPTO' | 'MONOTRIBUTO' | 'EXENTO' | null;
  mainActivity?: string | null;
  /** 'AAAA-MM' - ARCA informa sólo mes y año. */
  activityStartMonth?: string | null;
}

/**
 * Padrón de ARCA por CUIT (constancia de inscripción). Usa el certificado
 * de Oplex (ArcaPadronService), no el del tenant - lookup() tira
 * AfipNotConfiguredError si Oplex todavía no cargó el suyo en Admin.
 */
export interface AfipPadronPort {
  /** null when AFIP has no record for this CUIT. */
  lookup(cuit: string): Promise<AfipPadronData | null>;
}

export const AFIP_PADRON = Symbol('AFIP_PADRON');

export class AfipNotConfiguredError extends Error {
  constructor() {
    super('AFIP lookup is not configured on this server');
    this.name = 'AfipNotConfiguredError';
  }
}

// CUIT inexistente en el padrón, con un mensaje para mostrar tal cual
// (p. ej. la aclaración de homologación). Un lookup que devuelve null
// sigue siendo "no encontrado" con el mensaje genérico.
export class AfipNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AfipNotFoundError';
  }
}

export class AfipLookupError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AfipLookupError';
  }
}
