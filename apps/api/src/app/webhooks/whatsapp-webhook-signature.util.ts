import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verificación de `X-Hub-Signature-256` de Meta (docs/plan-asistente-ia-conversacional.md,
 * sección 6.3) - HMAC-SHA256 del BODY CRUDO (bytes tal cual llegaron, antes
 * de parsear JSON) contra WHATSAPP_APP_SECRET. A diferencia de la firma de
 * Mercado Pago (que arma un manifest de texto a partir de headers/query, ver
 * mercadopago-webhook-signature.util.ts), acá el propio cuerpo del POST es
 * lo que se firma - por eso este endpoint necesita `rawBody` habilitado en
 * el FastifyAdapter (ver main.ts), no alcanza con `request.body` ya
 * parseado.
 *
 * Devuelve false (nunca lanza) ante cualquier entrada malformada - mismo
 * criterio que la de Mercado Pago: un webhook nunca debe 500 por un header
 * atacante-controlado, una firma inválida ES el resultado "rechazar", no un
 * error.
 */
export function verifyWhatsAppWebhookSignature(rawBody: Buffer | undefined, signatureHeader: string | undefined, secret: string): boolean {
  if (!rawBody || !signatureHeader || !secret) {
    return false;
  }
  const prefix = 'sha256=';
  if (!signatureHeader.startsWith(prefix)) {
    return false;
  }
  const receivedHex = signatureHeader.slice(prefix.length);
  const expectedHex = createHmac('sha256', secret).update(rawBody).digest('hex');
  return timingSafeCompareHex(expectedHex, receivedHex);
}

function timingSafeCompareHex(expectedHex: string, receivedHex: string): boolean {
  const expected = Buffer.from(expectedHex, 'hex');
  const received = Buffer.from(receivedHex, 'hex');
  if (expected.length !== received.length || expected.length === 0) {
    return false;
  }
  return timingSafeEqual(expected, received);
}
