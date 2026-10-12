import { OPLEX_SUPPORT_EMAIL } from '@plexo/types';

/** Cierre de los mails de cuenta: salen de no-responder@ pero llevan
 * Reply-To a soporte@, así que responder también llega. */
export const SUPPORT_FOOTER_TEXT = `¿Dudas? Respondé este mail o escribinos a ${OPLEX_SUPPORT_EMAIL}.`;

export function withSupportFooter(text: string): string {
  return `${text}\n\n${SUPPORT_FOOTER_TEXT}`;
}
