import { OPLEX_SUPPORT_EMAIL } from '@plexo/types';
import { SUPPORT_FOOTER_TEXT } from './support-footer.js';

export interface VerificationEmailCopy {
  subject: string;
  html: string;
  text: string;
}

/**
 * Signup's very first touchpoint - a plain "here's your code" email reads
 * cold right after someone just chose to trust us with their business
 * data, so this leads with a welcome instead. Table-based layout + inline
 * styles throughout (no <style> block, no flexbox/grid) because Outlook
 * desktop renders HTML email through Word's engine, not a browser engine -
 * anything else silently breaks there.
 */
export function buildVerificationEmailCopy({
  code,
  expiresInMinutes,
}: {
  code: string;
  expiresInMinutes: number;
}): VerificationEmailCopy {
  const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>Tu código de verificación</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f1f4f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Tu código de verificación es ${code} · vence en ${expiresInMinutes} minutos</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f4f9;padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.08);">
            <tr>
              <td style="height:6px;line-height:6px;font-size:0;background:linear-gradient(90deg,#14b8a6,#22c55e);">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:36px 40px 0;text-align:center;">
                <h1 style="margin:0;font-size:22px;line-height:1.3;color:#0f172a;font-weight:700;">¡Bienvenido a Oplex! 🎉</h1>
                <p style="margin:12px 0 0;font-size:15px;line-height:1.6;color:#475569;">
                  Estás a un paso de tener tu facturación, inventario y contabilidad funcionando en un solo lugar. Confirmá tu email con este código para arrancar:
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 40px 4px;text-align:center;">
                <div style="display:inline-block;padding:14px 24px;border-radius:12px;background-color:#f0fdf4;border:1px solid #bbf7d0;">
                  <span style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:24px;font-weight:700;letter-spacing:7px;color:#0f172a;">${code}</span>
                </div>
                <p style="margin:16px 0 0;font-size:13px;color:#94a3b8;">Vence en ${expiresInMinutes} minutos</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 40px 32px;text-align:center;">
                <p style="margin:0;font-size:13px;line-height:1.6;color:#94a3b8;">
                  ¿No creaste una cuenta en Oplex? Ignorá este email - no se tomó ninguna acción.
                </p>
                <p style="margin:8px 0 0;font-size:13px;line-height:1.6;color:#94a3b8;">
                  ¿Dudas? Respondé este mail o escribinos a <a href="mailto:${OPLEX_SUPPORT_EMAIL}" style="color:#4f46e5;text-decoration:none;">${OPLEX_SUPPORT_EMAIL}</a>.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 40px;background-color:#f8fafc;text-align:center;border-top:1px solid #eef2f7;">
                <p style="margin:0;font-size:12px;color:#94a3b8;">Oplex · el ERP que crece con tu negocio</p>
                <p style="margin:6px 0 0;font-size:10px;color:#cbd5e1;text-align:center;">Equipo de Oplex</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `¡Bienvenido a Oplex!

Estás a un paso de tener tu facturación, inventario y contabilidad funcionando en un solo lugar.

Tu código de verificación es: ${code}
Vence en ${expiresInMinutes} minutos.

¿No creaste una cuenta en Oplex? Podés ignorar este mensaje - no se tomó ninguna acción.

${SUPPORT_FOOTER_TEXT}`;

  return { subject: '¡Bienvenido a Oplex! Confirmá tu email con tu código de verificación', html, text };
}
