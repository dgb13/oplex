import { Injectable, Logger } from '@nestjs/common';
import type {
  EmailSender,
  InvoiceEmailPayload,
  OverdueAlertEmailPayload,
  PaymentLinkEmailPayload,
} from './email-sender.port.js';
import { buildOverdueEmailCopy } from './overdue-email-templates.js';

/** Logs instead of sending. Used when RESEND_API_KEY/EMAIL_FROM aren't set. */
@Injectable()
export class ConsoleEmailSender implements EmailSender {
  private readonly logger = new Logger(ConsoleEmailSender.name);

  async sendInvoiceEmail(payload: InvoiceEmailPayload): Promise<void> {
    this.logger.log(
      `[stub] would email invoice ${payload.invoiceNumber} (total ${payload.total}) to ${payload.to} from ${payload.from ?? '(default sender)'}`,
    );
  }

  async sendPaymentLinkEmail(payload: PaymentLinkEmailPayload): Promise<void> {
    this.logger.log(
      `[stub] would email payment link for ${payload.invoiceLabel} (${payload.currencyCode} ${payload.amount}) to ${payload.to}: ${payload.url}`,
    );
  }

  async sendOverdueAlertEmail(payload: OverdueAlertEmailPayload): Promise<void> {
    const { subject } = buildOverdueEmailCopy(payload.tone, payload);
    const ccSuffix = payload.cc ? `, cc ${payload.cc}` : '';
    this.logger.log(
      `[stub] would email overdue alert "${subject}" for invoice ${payload.invoiceNumber} (balance ${payload.balanceDue}, due ${payload.dueDate}) to ${payload.to}${ccSuffix} from ${payload.from ?? '(default sender)'}`,
    );
  }
}
