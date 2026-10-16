import { OPLEX_BILLING_EMAIL, OPLEX_SUPPORT_EMAIL } from '@plexo/types';

/**
 * Textos de los avisos de la suscripción (mockup aprobado 2026-10-15,
 * "Fin de prueba y cobro de planes"). Cada builder devuelve asunto, HTML y
 * texto plano. HTML con tablas y estilos en línea, sin <style> ni flex/grid,
 * por la misma razón que verification-email-template.ts: Outlook de
 * escritorio dibuja los mails con el motor de Word.
 */

export interface NoticeCopy {
  subject: string;
  html: string;
  text: string;
}

const AR_TZ = 'America/Argentina/Buenos_Aires';
const DAY = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', timeZone: AR_TZ });
const FULL_DATE = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: AR_TZ });
const WEEKDAY = new Intl.DateTimeFormat('es-AR', { weekday: 'long', timeZone: AR_TZ });
const TIME = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: AR_TZ });
const MONEY = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 16/11 */
export function shortDate(date: Date): string {
  return DAY.format(date);
}
/** 16/11/2026 */
export function fullDate(date: Date): string {
  return FULL_DATE.format(date);
}
/** lunes 16/11 */
export function weekdayDate(date: Date): string {
  return `${WEEKDAY.format(date)} ${DAY.format(date)}`;
}
/** $ 290.037,00 */
export function money(value: number): string {
  return `$ ${MONEY.format(value)}`;
}
/** $ 79.900 (precio de lista sin decimales) */
function price(value: number): string {
  return `$ ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(value)}`;
}
function monthsLabel(months: number): string {
  return months === 12 ? '1 año' : `${months} ${months === 1 ? 'mes' : 'meses'}`;
}

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const INK = '#1b1530';
const MUTED = '#5b5670';
const INDIGO = '#4f46e5';
const TEAL = '#0f766e';

function button(label: string, href: string, color = INDIGO): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 4px;"><tr><td style="border-radius:9px;background-color:${color};"><a href="${esc(href)}" style="display:inline-block;padding:11px 18px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:9px;">${esc(label)}</a></td></tr></table>`;
}

function p(html: string, style = ''): string {
  return `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:${INK};${style}">${html}</p>`;
}

function box(html: string, tone: 'soft' | 'warn' = 'soft'): string {
  const colors = tone === 'warn' ? 'background-color:#fffbeb;border:1px solid #fde68a;color:#78350f;' : `background-color:#f5f4fb;color:${INK};`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px;"><tr><td style="${colors}border-radius:10px;padding:14px 16px;font-size:14px;line-height:1.5;">${html}</td></tr></table>`;
}

function rows(items: [string, string, boolean?][]): string {
  const cells = items
    .map(
      ([label, value, strong]) =>
        `<tr><td style="padding:4px 0;font-size:14px;color:${strong ? INK : MUTED};${strong ? 'font-weight:600;' : ''}">${esc(label)}</td><td style="padding:4px 0;font-size:14px;text-align:right;color:${INK};${strong ? 'font-weight:600;' : ''}">${value}</td></tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px;background-color:#f5f4fb;border-radius:10px;"><tr><td style="padding:12px 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${cells}</table></td></tr></table>`;
}

function layout(opts: { preheader: string; body: string; footer: string; internal?: boolean }): string {
  const ground = opts.internal ? '#e9f3f1' : '#eeedf4';
  const head = opts.internal
    ? `<p style="margin:0 0 14px;font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${TEAL};">Aviso interno de Oplex</p>`
    : `<p style="margin:0 0 18px;font-size:22px;font-weight:700;color:${INK};">oplex<span style="color:#f97316;">.</span></p>`;
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
  </head>
  <body style="margin:0;padding:0;background-color:${ground};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(opts.preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${ground};padding:28px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background-color:#ffffff;border-radius:14px;">
            <tr>
              <td style="padding:26px 26px 8px;">
                ${head}
                ${opts.body}
              </td>
            </tr>
            <tr>
              <td style="padding:14px 26px 22px;border-top:1px solid #e4e2ee;">
                <p style="margin:0;font-size:13px;line-height:1.5;color:${MUTED};">${opts.footer}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

const SUPPORT_FOOTER = `¿Dudas? Respondé este mail o escribinos a ${OPLEX_SUPPORT_EMAIL}.`;
const BILLING_FOOTER = `¿Dudas con el pago? Escribinos a ${OPLEX_BILLING_EMAIL}.`;

/** Texto plano a partir de párrafos, con el pie al final. */
function plain(paragraphs: string[], footer: string): string {
  return `${paragraphs.join('\n\n')}\n\n${footer}`;
}

export interface ClientContext {
  /** Nombre de quien recibe (o null: "Hola,"). */
  firstName: string | null;
  tenantName: string;
  /** Link a Planes y facturación. */
  billingUrl: string;
}

function hello(ctx: ClientContext): string {
  return ctx.firstName ? `Hola, ${ctx.firstName}:` : 'Hola:';
}

/** Mail 1 · Faltan 3 días de prueba. */
export function trialEndingCopy(
  ctx: ClientContext,
  data: { planName: string; trialEndsAt: Date; planPrice: number; annualDiscountPercent: number; free: { maxUsers: number; maxMonthlyInvoices: number } | null },
): NoticeCopy {
  const days = Math.max(1, Math.ceil((data.trialEndsAt.getTime() - Date.now()) / 86_400_000));
  const subject = `Te quedan ${days} día${days === 1 ? '' : 's'} de prueba en Oplex`;
  const annual = data.annualDiscountPercent > 0 ? ` Pagando el año tenés ${data.annualDiscountPercent}% de descuento.` : '';
  const freeLine = data.free
    ? `<li style="margin:0 0 6px;"><b>Basic Gratis</b>: sin costo, con ${data.free.maxUsers} usuario${data.free.maxUsers === 1 ? '' : 's'} y ${data.free.maxMonthlyInvoices} facturas por mes.</li>`
    : '';
  const body =
    p(esc(hello(ctx))) +
    p(`La prueba gratis de <b>${esc(ctx.tenantName)}</b> en el Plan ${esc(data.planName)} termina el <b>${esc(weekdayDate(data.trialEndsAt))}</b>. Desde ese día la cuenta queda en <b>sólo lectura</b>: vas a poder ver y exportar todo, pero no cargar facturas, ventas ni stock.`) +
    p('Para seguir sin cortes, elegí cómo continuar:') +
    `<ul style="margin:0 0 14px;padding-left:20px;font-size:15px;line-height:1.55;color:${INK};"><li style="margin:0 0 6px;"><b>Plan ${esc(data.planName)}</b>: ${price(data.planPrice)} + IVA por mes, por transferencia.${annual}</li>${freeLine}</ul>` +
    button('Elegir plan', ctx.billingUrl) +
    p('Lo que cargaste no se borra en ningún caso.', `font-size:13px;color:${MUTED};margin-top:10px;`);
  const text = plain(
    [
      hello(ctx),
      `La prueba gratis de ${ctx.tenantName} en el Plan ${data.planName} termina el ${weekdayDate(data.trialEndsAt)}. Desde ese día la cuenta queda en sólo lectura: vas a poder ver y exportar todo, pero no cargar facturas, ventas ni stock.`,
      `Para seguir sin cortes, elegí cómo continuar:\n- Plan ${data.planName}: ${price(data.planPrice)} + IVA por mes, por transferencia.${annual}${data.free ? `\n- Basic Gratis: sin costo, con ${data.free.maxUsers} usuario${data.free.maxUsers === 1 ? '' : 's'} y ${data.free.maxMonthlyInvoices} facturas por mes.` : ''}`,
      `Elegir plan: ${ctx.billingUrl}`,
      'Lo que cargaste no se borra en ningún caso.',
    ],
    SUPPORT_FOOTER,
  );
  return { subject, text, html: layout({ preheader: `Tu prueba termina el ${shortDate(data.trialEndsAt)}`, body, footer: esc(SUPPORT_FOOTER) }) };
}

/** Mail 2 · Terminó la prueba: sólo lectura. */
export function trialEndedCopy(ctx: ClientContext, data: { free: { maxUsers: number; maxMonthlyInvoices: number } | null }): NoticeCopy {
  const subject = 'Terminó tu prueba: tu cuenta quedó en sólo lectura';
  const freeHtml = data.free
    ? `<br /><br /><b>Si te alcanza con lo básico</b>, pasá a Basic Gratis (${data.free.maxUsers} usuario${data.free.maxUsers === 1 ? '' : 's'}, ${data.free.maxMonthlyInvoices} facturas por mes), sin costo.`
    : '';
  const body =
    p(esc(hello(ctx))) +
    p(`Hoy terminó la prueba gratis de <b>${esc(ctx.tenantName)}</b>. La cuenta sigue ahí, con todo lo que cargaste, pero en <b>sólo lectura</b>: podés entrar, ver, buscar y exportar, y no se pueden cargar facturas, ventas ni stock.`) +
    box(`<b>Para volver a cargar ahora mismo</b>, pagá el plan por transferencia y avisanos desde Oplex: la cuenta se reactiva apenas tocás "Ya transferí, avisar".${freeHtml}`) +
    button('Elegir plan', ctx.billingUrl) +
    p('Tus datos no se borran. Si en algún momento querés darte de baja del todo, escribinos.', `font-size:13px;color:${MUTED};margin-top:10px;`);
  const text = plain(
    [
      hello(ctx),
      `Hoy terminó la prueba gratis de ${ctx.tenantName}. La cuenta sigue ahí, con todo lo que cargaste, pero en sólo lectura: podés entrar, ver, buscar y exportar, y no se pueden cargar facturas, ventas ni stock.`,
      'Para volver a cargar ahora mismo, pagá el plan por transferencia y avisanos desde Oplex: la cuenta se reactiva apenas tocás "Ya transferí, avisar".',
      ...(data.free ? [`Si te alcanza con lo básico, pasá a Basic Gratis (${data.free.maxUsers} usuario${data.free.maxUsers === 1 ? '' : 's'}, ${data.free.maxMonthlyInvoices} facturas por mes), sin costo.`] : []),
      `Elegir plan: ${ctx.billingUrl}`,
      'Tus datos no se borran. Si en algún momento querés darte de baja del todo, escribinos.',
    ],
    SUPPORT_FOOTER,
  );
  return { subject, text, html: layout({ preheader: 'Tus datos están guardados. Elegí un plan para volver a cargar.', body, footer: esc(SUPPORT_FOOTER) }) };
}

/** Mail 3 · Venció el plan pago: días de gracia. */
export function pastDueCopy(ctx: ClientContext, data: { planName: string; periodEnd: Date; graceEndsAt: Date }): NoticeCopy {
  const subject = `Venció tu Plan ${data.planName}: tenés hasta el ${shortDate(data.graceEndsAt)} para pagar`;
  const body =
    p(esc(hello(ctx))) +
    p(`El período pago del Plan ${esc(data.planName)} de <b>${esc(ctx.tenantName)}</b> terminó el <b>${shortDate(data.periodEnd)}</b> y todavía no recibimos el pago siguiente.`) +
    box(`<b>Tu cuenta sigue funcionando normal hasta el ${shortDate(data.graceEndsAt)}.</b><br />Si para esa fecha no está el pago, pasa a sólo lectura hasta que lo regularices.`, 'warn') +
    p('Si ya transferiste, avisanos desde Oplex con el número de operación y lo confirmamos.') +
    button(`Pagar Plan ${data.planName}`, ctx.billingUrl);
  const text = plain(
    [
      hello(ctx),
      `El período pago del Plan ${data.planName} de ${ctx.tenantName} terminó el ${shortDate(data.periodEnd)} y todavía no recibimos el pago siguiente.`,
      `Tu cuenta sigue funcionando normal hasta el ${shortDate(data.graceEndsAt)}. Si para esa fecha no está el pago, pasa a sólo lectura hasta que lo regularices.`,
      'Si ya transferiste, avisanos desde Oplex con el número de operación y lo confirmamos.',
      `Pagar: ${ctx.billingUrl}`,
    ],
    BILLING_FOOTER,
  );
  return { subject, text, html: layout({ preheader: `Sigue funcionando hasta el ${shortDate(data.graceEndsAt)}`, body, footer: esc(BILLING_FOOTER) }) };
}

export interface PaymentSummary {
  planName: string;
  months: number;
  periodStart: Date;
  periodEnd: Date;
  netAmount: number;
  vatAmount: number;
  total: number;
  reference: string | null;
}

/** Mail 4 · Pago confirmado. */
export function paymentConfirmedCopy(ctx: ClientContext & { appUrl: string }, pay: PaymentSummary): NoticeCopy {
  const subject = `Confirmamos tu pago del Plan ${pay.planName}`;
  const detail: [string, string, boolean?][] = [
    ['Plan', `${esc(pay.planName)} · ${monthsLabel(pay.months)}`],
    ['Período', `${fullDate(pay.periodStart)} al ${fullDate(pay.periodEnd)}`],
    ['Neto', money(pay.netAmount)],
    ['IVA 21%', money(pay.vatAmount)],
    ['Total', money(pay.total), true],
  ];
  if (pay.reference) detail.push(['N° de operación', esc(pay.reference)]);
  const body =
    p(esc(hello(ctx))) +
    p(`Recibimos tu transferencia. ¡Gracias! <b>${esc(ctx.tenantName)}</b> tiene el Plan ${esc(pay.planName)} pago hasta el <b>${fullDate(pay.periodEnd)}</b>.`) +
    rows(detail) +
    p('Unos días antes del vencimiento te avisamos para renovar.', `font-size:14px;color:${MUTED};`) +
    button('Ir a Oplex', ctx.appUrl);
  const text = plain(
    [
      hello(ctx),
      `Recibimos tu transferencia. ¡Gracias! ${ctx.tenantName} tiene el Plan ${pay.planName} pago hasta el ${fullDate(pay.periodEnd)}.`,
      [
        `Plan: ${pay.planName} · ${monthsLabel(pay.months)}`,
        `Período: ${fullDate(pay.periodStart)} al ${fullDate(pay.periodEnd)}`,
        `Neto: ${money(pay.netAmount)}`,
        `IVA 21%: ${money(pay.vatAmount)}`,
        `Total: ${money(pay.total)}`,
        ...(pay.reference ? [`N° de operación: ${pay.reference}`] : []),
      ].join('\n'),
      'Unos días antes del vencimiento te avisamos para renovar.',
    ],
    BILLING_FOOTER,
  );
  return { subject, text, html: layout({ preheader: `Plan ${pay.planName} pago hasta el ${fullDate(pay.periodEnd)}`, body, footer: esc(BILLING_FOOTER) }) };
}

/** Mail 5 · No encontramos la transferencia. */
export function paymentRejectedCopy(
  ctx: ClientContext,
  pay: { createdAt: Date; total: number; reference: string | null; note: string | null; readOnlyNow: boolean },
): NoticeCopy {
  const subject = 'No pudimos confirmar tu transferencia';
  const ref = pay.reference ? ` (operación <span style="font-family:Consolas,Menlo,monospace;">${esc(pay.reference)}</span>)` : '';
  const state = pay.readOnlyNow
    ? 'La cuenta volvió a <b>sólo lectura</b>. Apenas transfieras y avises de nuevo, vuelve a funcionar.'
    : 'Tu cuenta sigue funcionando hasta la fecha que ya tenía. Transferí y volvé a avisar para que la confirmemos.';
  const body =
    p(esc(hello(ctx))) +
    p(`Revisamos el aviso de transferencia del ${shortDate(pay.createdAt)} por <b>${money(pay.total)}</b>${ref} y no la encontramos en nuestra cuenta.`) +
    (pay.note
      ? box(`<span style="font-size:12px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:${MUTED};">Lo que nos dijo el equipo</span><br />${esc(pay.note)}`)
      : '') +
    p(state) +
    button('Volver a avisar', ctx.billingUrl);
  const footer = `¿Creés que es un error? Respondé este mail con el comprobante o escribinos a ${OPLEX_BILLING_EMAIL}.`;
  const text = plain(
    [
      hello(ctx),
      `Revisamos el aviso de transferencia del ${shortDate(pay.createdAt)} por ${money(pay.total)}${pay.reference ? ` (operación ${pay.reference})` : ''} y no la encontramos en nuestra cuenta.`,
      ...(pay.note ? [`Lo que nos dijo el equipo: ${pay.note}`] : []),
      pay.readOnlyNow
        ? 'La cuenta volvió a sólo lectura. Apenas transfieras y avises de nuevo, vuelve a funcionar.'
        : 'Tu cuenta sigue funcionando hasta la fecha que ya tenía. Transferí y volvé a avisar para que la confirmemos.',
      `Volver a avisar: ${ctx.billingUrl}`,
    ],
    footer,
  );
  return { subject, text, html: layout({ preheader: 'Revisá el importe y volvé a avisar', body, footer: esc(footer) }) };
}

/** Mail 6 · Renovación: el plan vence en unos días. */
export function renewalReminderCopy(ctx: ClientContext, data: { planName: string; periodEnd: Date; planPrice: number; graceDays: number }): NoticeCopy {
  const days = Math.max(1, Math.ceil((data.periodEnd.getTime() - Date.now()) / 86_400_000));
  const subject = `Tu Plan ${data.planName} vence el ${shortDate(data.periodEnd)}`;
  const body =
    p(esc(hello(ctx))) +
    p(`El Plan ${esc(data.planName)} de <b>${esc(ctx.tenantName)}</b> está pago hasta el <b>${esc(weekdayDate(data.periodEnd))}</b> (faltan ${days} día${days === 1 ? '' : 's'}).`) +
    p(`Para renovarlo, transferí y avisanos desde Oplex: ${price(data.planPrice)} + IVA por mes, o pagá varios meses juntos. El período nuevo arranca cuando termina el actual, así que no perdés días por pagar antes.`) +
    button('Renovar plan', ctx.billingUrl) +
    p(`Si se pasa la fecha, la cuenta sigue funcionando ${data.graceDays} días más antes de quedar en sólo lectura.`, `font-size:13px;color:${MUTED};margin-top:10px;`);
  const text = plain(
    [
      hello(ctx),
      `El Plan ${data.planName} de ${ctx.tenantName} está pago hasta el ${weekdayDate(data.periodEnd)} (faltan ${days} día${days === 1 ? '' : 's'}).`,
      `Para renovarlo, transferí y avisanos desde Oplex: ${price(data.planPrice)} + IVA por mes, o pagá varios meses juntos. El período nuevo arranca cuando termina el actual, así que no perdés días por pagar antes.`,
      `Renovar: ${ctx.billingUrl}`,
      `Si se pasa la fecha, la cuenta sigue funcionando ${data.graceDays} días más antes de quedar en sólo lectura.`,
    ],
    BILLING_FOOTER,
  );
  return { subject, text, html: layout({ preheader: `Renová antes del ${shortDate(data.periodEnd)}`, body, footer: esc(BILLING_FOOTER) }) };
}

/** A facturacion@ · Un cliente avisó una transferencia. */
export function oplexNewTransferCopy(data: {
  tenantName: string;
  taxId: string | null;
  planName: string;
  months: number;
  total: number;
  reference: string | null;
  reportedAt: Date;
  reportedBy: string | null;
  receiptUrl: string | null;
  coveredUntil: Date;
  adminUrl: string;
}): NoticeCopy {
  const subject = `Transferencia para confirmar: ${data.tenantName} · ${money(data.total)}`;
  const reminderDay = new Date(data.coveredUntil.getTime() - 86_400_000);
  const detail: [string, string, boolean?][] = [
    ['Empresa', esc(data.tenantName)],
    ...(data.taxId ? ([['CUIT', esc(data.taxId)]] as [string, string][]) : []),
    ['Plan', `${esc(data.planName)} · ${monthsLabel(data.months)}`],
    ['Importe a buscar', money(data.total), true],
    ['N° de operación', data.reference ? esc(data.reference) : 'no lo cargó'],
    ['Avisó', `${shortDate(data.reportedAt)} ${TIME.format(data.reportedAt)}${data.reportedBy ? ` · ${esc(data.reportedBy)}` : ''}`],
    ['Comprobante', data.receiptUrl ? `<a href="${esc(data.receiptUrl)}" style="color:${TEAL};">ver comprobante</a>` : 'no lo subió'],
  ];
  const body =
    p(`Un cliente avisó una transferencia. Su cuenta ya quedó activa en forma provisoria <b>hasta el ${esc(weekdayDate(data.coveredUntil))}</b>.`) +
    rows(detail) +
    button('Confirmar o rechazar en /admin', data.adminUrl, TEAL);
  const footer = `Si no la revisás antes del ${shortDate(data.coveredUntil)}, la cuenta del cliente vuelve a su estado anterior sola. Te mandamos un recordatorio el ${shortDate(reminderDay)}.`;
  const text = plain(
    [
      `Un cliente avisó una transferencia. Su cuenta ya quedó activa en forma provisoria hasta el ${weekdayDate(data.coveredUntil)}.`,
      [
        `Empresa: ${data.tenantName}`,
        ...(data.taxId ? [`CUIT: ${data.taxId}`] : []),
        `Plan: ${data.planName} · ${monthsLabel(data.months)}`,
        `Importe a buscar: ${money(data.total)}`,
        `N° de operación: ${data.reference ?? 'no lo cargó'}`,
        `Avisó: ${shortDate(data.reportedAt)} ${TIME.format(data.reportedAt)}${data.reportedBy ? ` · ${data.reportedBy}` : ''}`,
        `Comprobante: ${data.receiptUrl ?? 'no lo subió'}`,
      ].join('\n'),
      `Confirmar o rechazar: ${data.adminUrl}`,
    ],
    footer,
  );
  return { subject, text, html: layout({ preheader: `${data.tenantName} avisó ${money(data.total)}`, body, footer: esc(footer), internal: true }) };
}

export interface PendingTransferRow {
  tenantName: string;
  total: number;
  coveredUntil: Date;
}

/** A facturacion@ · Recordatorio diario: créditos que vencen mañana. */
export function oplexPendingReminderCopy(items: PendingTransferRow[], adminUrl: string): NoticeCopy {
  const n = items.length;
  const subject = `Mañana vence: ${n} transferencia${n === 1 ? '' : 's'} sin confirmar`;
  const table = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px;border:1px solid #e4e2ee;border-radius:10px;"><tr><td style="padding:9px 14px;font-size:12px;color:${MUTED};background-color:#f7f7fb;">Empresa</td><td style="padding:9px 14px;font-size:12px;color:${MUTED};background-color:#f7f7fb;text-align:right;">Importe</td><td style="padding:9px 14px;font-size:12px;color:${MUTED};background-color:#f7f7fb;text-align:right;">Vence</td></tr>${items
    .map(
      (r) =>
        `<tr><td style="padding:9px 14px;font-size:14px;border-top:1px solid #f0eef6;">${esc(r.tenantName)}</td><td style="padding:9px 14px;font-size:14px;border-top:1px solid #f0eef6;text-align:right;">${money(r.total)}</td><td style="padding:9px 14px;font-size:14px;border-top:1px solid #f0eef6;text-align:right;color:#b45309;font-weight:600;">${shortDate(r.coveredUntil)}</td></tr>`,
    )
    .join('')}</table>`;
  const body =
    p(`Est${n === 1 ? 'a transferencia sigue' : 'as transferencias siguen'} <b>por confirmar</b> y el crédito provisorio de la cuenta vence <b>mañana</b>. Si no las revisás, esos clientes vuelven a su estado anterior aunque hayan pagado.`) +
    table +
    button('Revisar en /admin', adminUrl, TEAL);
  const footer = 'Un solo mail por día con todas las que vencen al día siguiente.';
  const text = plain(
    [
      `Estas transferencias siguen por confirmar y el crédito provisorio de la cuenta vence mañana:`,
      items.map((r) => `- ${r.tenantName}: ${money(r.total)} (vence ${shortDate(r.coveredUntil)})`).join('\n'),
      `Revisar: ${adminUrl}`,
    ],
    footer,
  );
  return { subject, text, html: layout({ preheader: `${n} sin confirmar`, body, footer: esc(footer), internal: true }) };
}
