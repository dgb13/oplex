import type { ReminderTone } from '@plexo/database';

export interface InvoiceEmailPayload {
  to: string;
  invoiceNumber: string;
  total: string;
  /** Per-tenant custom sender (see resolveEmailFrom in @plexo/tenant-settings)
   * - undefined means "use this sender's own default (global EMAIL_FROM)". */
  from?: string;
}

export interface OverdueAlertEmailPayload {
  to: string;
  invoiceNumber: string;
  balanceDue: string;
  dueDate: string;
  /** Per-tenant custom sender, same meaning as InvoiceEmailPayload.from. */
  from?: string;
  /** Which of the 3 preset wordings to use - undefined defaults to NEUTRAL,
   * see buildOverdueEmailCopy in overdue-email-templates.ts. */
  tone?: ReminderTone;
  /** Internal mailbox to CC on the reminder (e.g. cobranzas@empresa.com) -
   * works with the shared sender, no custom domain needed. */
  cc?: string;
}

/**
 * Resend is the real provider (see ResendEmailSender); InvoicingService
 * depends on this interface, not the concrete class, so swapping providers
 * later is one new class + one line in InvoicingModule, not a change to
 * InvoicingService.
 */
// Link de pago de Mercado Pago de una factura, pedido desde el asistente
// (docs/planesdemodulos/plan-asistente-fase2-gestion-acciones.md, etapa 3).
export interface PaymentLinkEmailPayload {
  to: string;
  // "Factura A 00003-00000120"
  invoiceLabel: string;
  amount: string;
  currencyCode: string;
  url: string;
  businessName: string;
  from?: string;
}

export interface EmailSender {
  sendInvoiceEmail(payload: InvoiceEmailPayload): Promise<void>;
  sendOverdueAlertEmail(payload: OverdueAlertEmailPayload): Promise<void>;
  /** A diferencia de los otros dos, LANZA si no se pudo mandar: quien lo
   * pidió tiene que enterarse de que al cliente no le llegó nada. */
  sendPaymentLinkEmail(payload: PaymentLinkEmailPayload): Promise<void>;
}

export const EMAIL_SENDER = Symbol('EMAIL_SENDER');
