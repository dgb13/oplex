import type { MembershipNoticeKind } from './auth-email-sender.port.js';

/** Texto de aviso para las 4 transiciones de una TenantMembership que
 * generan notificación (ver docs/plan_modulo_contadores.txt, Fase 2 punto
 * 3) - centralizado acá para que Resend/Console compartan exactamente la
 * misma redacción, mismo criterio que buildVerificationEmailCopy. */
export function buildMembershipNoticeCopy(payload: {
  tenantName: string;
  counterpartName: string;
  kind: MembershipNoticeKind;
  portalUrl: string;
}): { subject: string; text: string } {
  const { tenantName, counterpartName, kind, portalUrl } = payload;

  switch (kind) {
    case 'invited':
      return {
        subject: `${counterpartName} te invitó como su estudio contable en Oplex`,
        text: `Hola, equipo de ${tenantName}: ${counterpartName} te invitó a ser su estudio contable en Oplex. Para aceptar o rechazar, entrá a ${portalUrl}.`,
      };
    case 'requested':
      return {
        subject: `${counterpartName} pidió acceso como tu estudio contable en Oplex`,
        text: `Hola, equipo de ${tenantName}: el estudio contable ${counterpartName} pidió acceso a tu cuenta de Oplex. Para aceptar o rechazar, entrá a ${portalUrl}.`,
      };
    case 'accepted':
      return {
        subject: `${counterpartName} aceptó tu solicitud en Oplex`,
        text: `Hola, equipo de ${tenantName}: ${counterpartName} aceptó tu invitación/solicitud de acceso en Oplex. Ya podés verlo desde ${portalUrl}.`,
      };
    case 'declined':
      return {
        subject: `${counterpartName} rechazó tu solicitud en Oplex`,
        text: `Hola, equipo de ${tenantName}: ${counterpartName} rechazó tu invitación/solicitud de acceso en Oplex. Podés verlo desde ${portalUrl}.`,
      };
    case 'revoked':
      return {
        subject: `${counterpartName} cortó la relación en Oplex`,
        text: `Hola, equipo de ${tenantName}: ${counterpartName} revocó su relación activa con vos en Oplex. Podés verlo desde ${portalUrl}.`,
      };
    case 'cancelled':
      return {
        subject: `${counterpartName} canceló su solicitud en Oplex`,
        text: `Hola, equipo de ${tenantName}: ${counterpartName} canceló la invitación/solicitud que te había mandado en Oplex. Podés verlo desde ${portalUrl}.`,
      };
  }
}
