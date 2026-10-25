import type { SupportTicketType } from '@plexo/database';

export const SUPPORT_TYPE_LABEL: Record<SupportTicketType, string> = {
  ERROR: 'Error',
  QUESTION: 'Consulta',
  SUGGESTION: 'Sugerencia',
};

export function ticketCode(n: number): string {
  return `#${String(n).padStart(4, '0')}`;
}

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function paragraphs(text: string): string {
  return esc(text)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px;line-height:1.55;">${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function layout(inner: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f4f7;font-family:Arial,Helvetica,sans-serif;color:#1b1530;">
<div style="max-width:600px;margin:0 auto;padding:24px 16px;">
<div style="background:#ffffff;border-radius:12px;padding:24px;font-size:14px;">${inner}</div>
<p style="font-size:12px;color:#5b5670;text-align:center;margin:16px 0 0;">Oplex · Soporte</p>
</div></body></html>`;
}

function button(label: string, href: string): string {
  return `<p style="margin:18px 0 0;"><a href="${esc(href)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:bold;">${esc(label)}</a></p>`;
}

export interface NewTicketMailInput {
  number: number;
  type: SupportTicketType;
  module: string;
  subject: string;
  body: string;
  tenantName: string;
  tenantTaxId: string | null;
  userEmail: string;
  userName: string | null;
  role: string;
  context: Record<string, unknown> | null;
  attachmentCount: number;
  adminUrl: string;
}

/** Aviso a soporte@ de una consulta nueva (con las capturas adjuntas). */
export function newTicketForSupportMail(i: NewTicketMailInput) {
  const subject = `[Soporte ${ticketCode(i.number)}] ${SUPPORT_TYPE_LABEL[i.type]}: ${i.subject}`;
  const facts = [
    `Empresa: ${i.tenantName}${i.tenantTaxId ? ` (${i.tenantTaxId})` : ''}`,
    `Usuario: ${i.userName ? `${i.userName} · ` : ''}${i.userEmail} (${i.role})`,
    `Sección: ${i.module}`,
    i.attachmentCount ? `Adjuntos: ${i.attachmentCount}` : null,
  ].filter(Boolean) as string[];
  const ctx = i.context
    ? Object.entries(i.context)
        .map(([k, v]) => `${k}: ${String(v)}`)
        .join('\n')
    : null;
  const text = [
    `Consulta nueva ${ticketCode(i.number)} - ${SUPPORT_TYPE_LABEL[i.type]}`,
    '',
    ...facts,
    '',
    i.subject,
    '',
    i.body,
    ctx ? `\nDatos técnicos:\n${ctx}` : '',
    '',
    `Responder desde el panel: ${i.adminUrl}`,
    'Si respondés este mail le llega al usuario directo, pero no queda en el historial de la consulta.',
  ].join('\n');
  const html = layout(
    `<p style="margin:0 0 4px;color:#5b5670;font-size:12px;">Consulta nueva ${ticketCode(i.number)} · ${SUPPORT_TYPE_LABEL[i.type]}</p>
<h2 style="margin:0 0 12px;font-size:18px;">${esc(i.subject)}</h2>
<p style="margin:0 0 14px;color:#5b5670;line-height:1.6;">${facts.map(esc).join('<br>')}</p>
${paragraphs(i.body)}
${ctx ? `<pre style="background:#f4f4f7;border-radius:8px;padding:10px;font-size:12px;white-space:pre-wrap;">${esc(ctx)}</pre>` : ''}
${button('Responder desde el panel', i.adminUrl)}
<p style="margin:14px 0 0;font-size:12px;color:#5b5670;">Si respondés este mail le llega al usuario directo, pero no queda en el historial de la consulta.</p>`,
  );
  return { subject, text, html };
}

/** Acuse al usuario: recibimos tu consulta. */
export function ticketReceivedMail(i: { number: number; subject: string; firstName: string; appUrl: string }) {
  const subject = `Recibimos tu consulta ${ticketCode(i.number)}`;
  const text = `Hola ${i.firstName},\n\nRecibimos tu consulta "${i.subject}" (${ticketCode(i.number)}). Te avisamos por mail cuando te respondamos. También la podés seguir en Oplex → Ayuda y soporte: ${i.appUrl}\n\nEquipo de Oplex`;
  const html = layout(
    `<p style="margin:0 0 12px;">Hola ${esc(i.firstName)},</p>
${paragraphs(`Recibimos tu consulta "${i.subject}" (${ticketCode(i.number)}). Te avisamos por mail cuando te respondamos.`)}
${button('Ver mis consultas', i.appUrl)}
<p style="margin:18px 0 0;">Equipo de Oplex</p>`,
  );
  return { subject, text, html };
}

/** Respuesta de Oplex al usuario. */
export function adminReplyMail(i: { number: number; subject: string; firstName: string; body: string; appUrl: string }) {
  const subject = `Re: ${i.subject} (${ticketCode(i.number)})`;
  const text = `Hola ${i.firstName},\n\n${i.body}\n\nPara responder, entrá a Oplex → Ayuda y soporte: ${i.appUrl}\n\nEquipo de Oplex`;
  const html = layout(
    `<p style="margin:0 0 4px;color:#5b5670;font-size:12px;">Tu consulta ${ticketCode(i.number)} · ${esc(i.subject)}</p>
<p style="margin:12px 0;">Hola ${esc(i.firstName)},</p>
${paragraphs(i.body)}
${button('Ver y responder en Oplex', i.appUrl)}
<p style="margin:18px 0 0;">Equipo de Oplex</p>`,
  );
  return { subject, text, html };
}

/** Aviso a soporte@ de que el usuario respondió. */
export function userReplyForSupportMail(i: {
  number: number;
  subject: string;
  tenantName: string;
  userEmail: string;
  body: string;
  adminUrl: string;
}) {
  const subject = `[Soporte ${ticketCode(i.number)}] Respuesta de ${i.tenantName}: ${i.subject}`;
  const text = `${i.userEmail} (${i.tenantName}) respondió:\n\n${i.body}\n\nVer en el panel: ${i.adminUrl}`;
  const html = layout(
    `<p style="margin:0 0 12px;color:#5b5670;">${esc(i.userEmail)} (${esc(i.tenantName)}) respondió en ${ticketCode(i.number)}:</p>
${paragraphs(i.body)}
${button('Ver en el panel', i.adminUrl)}`,
  );
  return { subject, text, html };
}
