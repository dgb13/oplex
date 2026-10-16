export interface SendVerificationCodePayload {
  to: string;
  code: string;
  expiresInMinutes: number;
}

export interface SendPasswordResetLinkPayload {
  to: string;
  resetUrl: string;
  expiresInMinutes: number;
}

export interface SendInvitationPayload {
  to: string;
  tenantName: string;
  role: string;
  acceptUrl: string;
  expiresInMinutes: number;
}

export type MembershipNoticeKind = 'invited' | 'requested' | 'accepted' | 'declined' | 'revoked' | 'cancelled';

export interface SendMembershipNoticePayload {
  to: string;
  tenantName: string; // el tenant que recibe el aviso (a quién le hablamos)
  counterpartName: string; // el otro tenant (quién invitó/pidió/respondió)
  kind: MembershipNoticeKind;
  portalUrl: string;
}

// Aviso en texto plano (pedidos de arrepentimiento o de baja): uno al
// titular del servicio y otro, con el número de trámite, a quien lo pidió.
export interface SendLegalNoticePayload {
  to: string;
  subject: string;
  text: string;
  /** A quién le llega si responden - por defecto soporte@oplex.com.ar. */
  replyTo?: string;
}

// Aviso con diseño (HTML + texto plano): los de la suscripción al cliente y
// los internos a facturacion@ (ver SubscriptionNoticeService).
export interface SendHtmlNoticePayload {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** A quién le llega si responden - por defecto soporte@oplex.com.ar. */
  replyTo?: string;
}

/**
 * Mismo patrón puerto/adaptador que EmailSender de Facturación
 * (libs/modules/invoicing/src/lib/email-sender.port.ts) - SignupService y
 * AuthService dependen de esta interfaz, no de la clase concreta.
 */
export interface AuthEmailSender {
  sendVerificationCode(payload: SendVerificationCodePayload): Promise<void>;
  sendPasswordResetLink(payload: SendPasswordResetLinkPayload): Promise<void>;
  sendInvitation(payload: SendInvitationPayload): Promise<void>;
  sendMembershipNotice(payload: SendMembershipNoticePayload): Promise<void>;
  sendLegalNotice(payload: SendLegalNoticePayload): Promise<void>;
  sendHtmlNotice(payload: SendHtmlNoticePayload): Promise<void>;
}

export const AUTH_EMAIL_SENDER = Symbol('AUTH_EMAIL_SENDER');
