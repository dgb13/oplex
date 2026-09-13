import type { MercadoPagoWebhookService } from './mercadopago-webhook.service.js';
import { MercadoPagoWebhookController } from './mercadopago-webhook.controller.js';

// Same reasoning as apps/api's sales.service.spec.ts - this controller
// transitively imports SalesService, whose real @plexo/invoicing module
// pulls in @react-pdf/renderer (ESM the Jest/swc pipeline can't parse
// through the dist symlink).
jest.mock('@plexo/invoicing', () => ({}));
// Same reasoning, now also for @plexo/quotes (SalesService.createInvoiceFromQuote).
jest.mock('@plexo/quotes', () => ({}));

function makeService(): jest.Mocked<MercadoPagoWebhookService> {
  return { handleNotification: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<MercadoPagoWebhookService>;
}

describe('MercadoPagoWebhookController', () => {
  it('prefers data.id/type from the body over the query string', async () => {
    const service = makeService();
    const controller = new MercadoPagoWebhookController(service);

    await controller.handle(
      'ts=1,v1=abc',
      'req-1',
      { client: 'tenant-1', 'data.id': 'from-query', type: 'from-query' },
      { type: 'payment', data: { id: 'from-body' } },
    );

    expect(service.handleNotification).toHaveBeenCalledWith({
      signatureHeader: 'ts=1,v1=abc',
      requestId: 'req-1',
      dataId: 'from-body',
      type: 'payment',
      tenantIdParam: 'tenant-1',
      payload: { type: 'payment', data: { id: 'from-body' } },
    });
  });

  it('falls back to query params when the body has no data.id/type', async () => {
    const service = makeService();
    const controller = new MercadoPagoWebhookController(service);

    await controller.handle('ts=1,v1=abc', 'req-1', { client: 'tenant-1', 'data.id': '42', type: 'payment' }, undefined);

    expect(service.handleNotification).toHaveBeenCalledWith(
      expect.objectContaining({ dataId: '42', type: 'payment', tenantIdParam: 'tenant-1' }),
    );
  });

  it('ping() responds without requiring auth (smoke check MP can hit)', () => {
    const controller = new MercadoPagoWebhookController(makeService());

    expect(controller.ping()).toBe('ok');
  });
});
