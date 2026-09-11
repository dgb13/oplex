import { createHmac } from 'node:crypto';
import { verifyWhatsAppWebhookSignature } from './whatsapp-webhook-signature.util.js';

const SECRET = 'test-app-secret';

/** Reconstruye la firma de forma independiente (no reusa createHmac desde el
 * SUT indirectamente vía un helper compartido) - mismo criterio que
 * mercadopago-webhook-signature.util.spec.ts. */
function realSignature(body: Buffer, secret = SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

describe('verifyWhatsAppWebhookSignature', () => {
  it('accepts a correctly signed body', () => {
    const body = Buffer.from(JSON.stringify({ entry: [] }));
    const result = verifyWhatsAppWebhookSignature(body, realSignature(body), SECRET);
    expect(result).toBe(true);
  });

  it('rejects a tampered body signed under a different payload', () => {
    const original = Buffer.from(JSON.stringify({ entry: [] }));
    const tampered = Buffer.from(JSON.stringify({ entry: ['injected'] }));
    const result = verifyWhatsAppWebhookSignature(tampered, realSignature(original), SECRET);
    expect(result).toBe(false);
  });

  it('rejects when signed with a different secret', () => {
    const body = Buffer.from(JSON.stringify({ entry: [] }));
    const result = verifyWhatsAppWebhookSignature(body, realSignature(body, 'wrong-secret'), SECRET);
    expect(result).toBe(false);
  });

  it('rejects a missing signature header', () => {
    const body = Buffer.from(JSON.stringify({ entry: [] }));
    expect(verifyWhatsAppWebhookSignature(body, undefined, SECRET)).toBe(false);
  });

  it('rejects a missing raw body', () => {
    expect(verifyWhatsAppWebhookSignature(undefined, 'sha256=deadbeef', SECRET)).toBe(false);
  });

  it('rejects a header without the sha256= prefix', () => {
    const body = Buffer.from(JSON.stringify({ entry: [] }));
    expect(verifyWhatsAppWebhookSignature(body, createHmac('sha256', SECRET).update(body).digest('hex'), SECRET)).toBe(false);
  });

  it('never throws on garbage input', () => {
    const body = Buffer.from('not json at all');
    expect(() => verifyWhatsAppWebhookSignature(body, 'sha256=not-hex-zzz', SECRET)).not.toThrow();
    expect(() => verifyWhatsAppWebhookSignature(body, 'garbage', '')).not.toThrow();
  });
});
