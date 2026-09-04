import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import type {
  AuthEmailSender,
  SendInvitationPayload,
  SendMembershipNoticePayload,
  SendPasswordResetLinkPayload,
  SendVerificationCodePayload,
} from './auth-email-sender.port.js';
import { buildVerificationEmailCopy } from './verification-email-template.js';
import { buildMembershipNoticeCopy } from './membership-notice-template.js';

/** Real sender, wired in sólo cuando RESEND_API_KEY está seteado (ver
 * AuthEmailModule) - mismo criterio que ResendEmailSender de Facturación.
 * Fallos se loguean, no se propagan: un signup/reset no debe fallar porque
 * el mail rebotó, el código/token ya quedó persistido y puede reenviarse. */
@Injectable()
export class ResendAuthEmailSender implements AuthEmailSender {
  private readonly logger = new Logger(ResendAuthEmailSender.name);
  private readonly resend: Resend;
  private readonly from: string;

  constructor(apiKey: string, from: string) {
    this.resend = new Resend(apiKey);
    this.from = from;
  }

  async sendVerificationCode(payload: SendVerificationCodePayload): Promise<void> {
    const { subject, html, text } = buildVerificationEmailCopy({
      code: payload.code,
      expiresInMinutes: payload.expiresInMinutes,
    });
    const { error } = await this.resend.emails.send({
      from: this.from,
      to: payload.to,
      subject,
      html,
      text,
    });

    if (error) {
      this.logger.error(`Failed to email verification code to ${payload.to}: ${error.message}`);
    }
  }

  async sendPasswordResetLink(payload: SendPasswordResetLinkPayload): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: this.from,
      to: payload.to,
      subject: 'Recuperar tu contraseña de Oplex',
      text: `Para elegir una contraseña nueva, entrá a ${payload.resetUrl}. El link expira en ${payload.expiresInMinutes} minutos. Si no pediste esto, ignorá este mensaje.`,
    });

    if (error) {
      this.logger.error(`Failed to email password reset link to ${payload.to}: ${error.message}`);
    }
  }

  async sendInvitation(payload: SendInvitationPayload): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: this.from,
      to: payload.to,
      subject: `Te invitaron a sumarte a ${payload.tenantName} en Oplex`,
      text: `Te invitaron a unirte a ${payload.tenantName} en Oplex con el rol ${payload.role}. Para aceptar, entrá a ${payload.acceptUrl}. El link expira en ${payload.expiresInMinutes} minutos. Si no esperabas esta invitación, ignorá este mensaje.`,
    });

    if (error) {
      this.logger.error(`Failed to email invitation to ${payload.to}: ${error.message}`);
    }
  }

  async sendMembershipNotice(payload: SendMembershipNoticePayload): Promise<void> {
    const { subject, text } = buildMembershipNoticeCopy(payload);
    const { error } = await this.resend.emails.send({
      from: this.from,
      to: payload.to,
      subject,
      text,
    });

    if (error) {
      this.logger.error(`Failed to email membership notice to ${payload.to}: ${error.message}`);
    }
  }
}
