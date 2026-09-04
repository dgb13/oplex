import { Injectable, Logger } from '@nestjs/common';
import type {
  AuthEmailSender,
  SendInvitationPayload,
  SendMembershipNoticePayload,
  SendPasswordResetLinkPayload,
  SendVerificationCodePayload,
} from './auth-email-sender.port.js';
import { buildMembershipNoticeCopy } from './membership-notice-template.js';

/** Logs instead of sending. Used when RESEND_API_KEY/EMAIL_FROM aren't set -
 * mismo criterio que ConsoleEmailSender de Facturación. */
@Injectable()
export class ConsoleAuthEmailSender implements AuthEmailSender {
  private readonly logger = new Logger(ConsoleAuthEmailSender.name);

  async sendVerificationCode(payload: SendVerificationCodePayload): Promise<void> {
    this.logger.log(
      `[stub] verification code for ${payload.to}: ${payload.code} (expira en ${payload.expiresInMinutes} min)`,
    );
  }

  async sendPasswordResetLink(payload: SendPasswordResetLinkPayload): Promise<void> {
    this.logger.log(
      `[stub] password reset link for ${payload.to}: ${payload.resetUrl} (expira en ${payload.expiresInMinutes} min)`,
    );
  }

  async sendInvitation(payload: SendInvitationPayload): Promise<void> {
    this.logger.log(
      `[stub] invitation for ${payload.to} to join ${payload.tenantName} as ${payload.role}: ${payload.acceptUrl} (expira en ${payload.expiresInMinutes} min)`,
    );
  }

  async sendMembershipNotice(payload: SendMembershipNoticePayload): Promise<void> {
    const { subject } = buildMembershipNoticeCopy(payload);
    this.logger.log(`[stub] membership notice for ${payload.to}: ${subject}`);
  }
}
