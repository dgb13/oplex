import { Prisma, tenantContextStorage } from '@plexo/database';
import type { PurchaseEmailSender } from './email/purchase-email-sender.port.js';
import type { PdfGeneratorService } from './pdf/pdf-generator.service.js';
import type { PurchaseNumberingService } from './purchase-numbering.service.js';
import { PurchaseOrderService } from './purchase-order.service.js';

function runAsUser<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

function makeNumbering(number = 'OC-000001'): PurchaseNumberingService {
  return { nextNumber: jest.fn().mockResolvedValue(number) } as unknown as PurchaseNumberingService;
}

function makePdfGenerator(): PdfGeneratorService {
  return { generate: jest.fn().mockResolvedValue(Buffer.from('pdf')) } as unknown as PdfGeneratorService;
}

function makeEmailSender(): PurchaseEmailSender {
  return {
    sendPurchaseOrderEmail: jest.fn().mockResolvedValue(undefined),
    sendFollowUpEmail: jest.fn().mockResolvedValue(undefined),
  };
}

function makeSupplier(overrides: Partial<{ active: boolean; roles: { role: string }[]; email: string | null }> = {}) {
  return {
    id: 'supplier-1',
    name: 'Distribuidora Norte',
    taxId: '20-1-1',
    email: overrides.email === undefined ? 'compras@norte.com' : overrides.email,
    fiscalAddress: null,
    active: overrides.active ?? true,
    roles: overrides.roles ?? [{ role: 'SUPPLIER' }],
  };
}

describe('PurchaseOrderService.create', () => {
  it('computes total from quantity*unitCost across all lines', async () => {
    const db = {
      company: { findUnique: jest.fn().mockResolvedValue(makeSupplier()) },
      currency: { findUnique: jest.fn().mockResolvedValue({ id: 'usd', code: 'USD' }) },
      articleVariant: { findUnique: jest.fn().mockResolvedValue({ id: 'variant-1' }) },
      purchaseOrder: { create: jest.fn((args) => Promise.resolve({ id: 'po-1', ...args.data })) },
    };
    const service = new PurchaseOrderService(makeNumbering('OC-000010'), makePdfGenerator(), makeEmailSender());

    const created = await runAsUser(db, () =>
      service.create({
        supplierId: 'supplier-1',
        currencyId: 'usd',
        lines: [
          { articleVariantId: 'variant-1', quantity: 3, unitCost: 10 },
          { articleVariantId: 'variant-1', quantity: 1, unitCost: 5 },
        ],
      }),
    );

    expect((created as { total: Prisma.Decimal }).total.toString()).toBe('35');
    expect(db.purchaseOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ number: 'OC-000010' }) }),
    );
  });

  it('rejects an inactive supplier', async () => {
    const db = { company: { findUnique: jest.fn().mockResolvedValue(makeSupplier({ active: false })) } };
    const service = new PurchaseOrderService(makeNumbering(), makePdfGenerator(), makeEmailSender());

    await expect(
      runAsUser(db, () =>
        service.create({ supplierId: 'supplier-1', currencyId: 'usd', lines: [{ articleVariantId: 'v', quantity: 1, unitCost: 1 }] }),
      ),
    ).rejects.toThrow('inactive');
  });
});

describe('PurchaseOrderService.cancel', () => {
  it('rejects cancelling an already-cancelled order', async () => {
    const db = { purchaseOrder: { findUnique: jest.fn().mockResolvedValue({ id: 'po-1', status: 'CANCELLED' }) } };
    const service = new PurchaseOrderService(makeNumbering(), makePdfGenerator(), makeEmailSender());

    await expect(runAsUser(db, () => service.cancel('po-1'))).rejects.toThrow('already cancelled');
  });
});

describe('PurchaseOrderService.sendEmail', () => {
  function makeOrderRow() {
    return {
      id: 'po-1',
      number: 'OC-000001',
      total: new Prisma.Decimal(100),
      notes: null,
      createdAt: new Date('2026-01-01'),
      currency: { code: 'USD' },
      supplier: makeSupplier(),
      transportMode: null,
      paymentTerm: null,
      deliveryTime: null,
      lines: [{ quantity: new Prisma.Decimal(1), unitCost: new Prisma.Decimal(100), articleVariant: { sku: 'SKU-1', article: { name: 'Agua' } } }],
    };
  }

  it('rejects when the supplier has no email on file', async () => {
    const db = {
      purchaseOrder: { findUnique: jest.fn().mockResolvedValue({ ...makeOrderRow(), supplier: makeSupplier({ email: null }) }) },
    };
    const service = new PurchaseOrderService(makeNumbering(), makePdfGenerator(), makeEmailSender());

    await expect(runAsUser(db, () => service.sendEmail('po-1'))).rejects.toThrow('no email on file');
  });

  it('generates the PDF, sends it, and marks the order SENT via EMAIL', async () => {
    const db = {
      purchaseOrder: {
        findUnique: jest.fn().mockResolvedValue(makeOrderRow()),
        update: jest.fn().mockResolvedValue({}),
      },
      tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ name: 'Mi Tenant', taxId: '30-1-1' }) },
      user: { findUniqueOrThrow: jest.fn().mockResolvedValue({ purchaseDocumentPdfStyle: 'MODERNO' }) },
    };
    const emailSender = makeEmailSender();
    const pdfGenerator = makePdfGenerator();
    const service = new PurchaseOrderService(makeNumbering(), pdfGenerator, emailSender);

    await runAsUser(db, () => service.sendEmail('po-1'));

    expect(pdfGenerator.generate).toHaveBeenCalled();
    expect(emailSender.sendPurchaseOrderEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'compras@norte.com', purchaseOrderNumber: 'OC-000001' }),
    );
    expect(db.purchaseOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'po-1' },
        data: {
          status: 'SENT',
          sentAt: expect.any(Date),
          sentVia: 'EMAIL',
          sentToEmail: 'compras@norte.com',
          sentToContactName: null,
          sentToContactAvatarUrl: null,
        },
      }),
    );
  });

  it('sends to a specific contact instead of the institutional email when given one', async () => {
    const db = {
      purchaseOrder: {
        findUnique: jest.fn().mockResolvedValue(makeOrderRow()),
        update: jest.fn().mockResolvedValue({}),
      },
      tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ name: 'Mi Tenant', taxId: '30-1-1' }) },
      user: { findUniqueOrThrow: jest.fn().mockResolvedValue({ purchaseDocumentPdfStyle: 'MODERNO' }) },
    };
    const emailSender = makeEmailSender();
    const service = new PurchaseOrderService(makeNumbering(), makePdfGenerator(), emailSender);

    await runAsUser(db, () =>
      service.sendEmail('po-1', { to: 'juan@norte.com', contactName: 'Juan Vendedor' }),
    );

    expect(emailSender.sendPurchaseOrderEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'juan@norte.com' }),
    );
    expect(db.purchaseOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sentToEmail: 'juan@norte.com',
          sentToContactName: 'Juan Vendedor',
        }),
      }),
    );
  });
});

describe('PurchaseOrderService.sendFollowUpEmail', () => {
  function makeOrderRow() {
    return {
      id: 'po-1',
      number: 'OC-000001',
      total: new Prisma.Decimal(100),
      notes: null,
      createdAt: new Date('2026-01-01'),
      currency: { code: 'USD' },
      supplier: makeSupplier(),
      transportMode: null,
      paymentTerm: null,
      deliveryTime: null,
      lines: [],
    };
  }

  it('sends the given text/subject as-is, without touching sentAt/sentVia', async () => {
    const db = {
      purchaseOrder: { findUnique: jest.fn().mockResolvedValue(makeOrderRow()), update: jest.fn() },
    };
    const emailSender = makeEmailSender();
    const service = new PurchaseOrderService(makeNumbering(), makePdfGenerator(), emailSender);

    await runAsUser(db, () =>
      service.sendFollowUpEmail('po-1', { to: 'laura@proveedor.com', text: '¿Ya despachaste la OC?' }),
    );

    expect(emailSender.sendFollowUpEmail).toHaveBeenCalledWith({
      to: 'laura@proveedor.com',
      subject: 'Seguimiento OC OC-000001',
      text: '¿Ya despachaste la OC?',
    });
    expect(db.purchaseOrder.update).not.toHaveBeenCalled();
  });

  it('uses a custom subject when one is given, instead of the default', async () => {
    const db = { purchaseOrder: { findUnique: jest.fn().mockResolvedValue(makeOrderRow()) } };
    const emailSender = makeEmailSender();
    const service = new PurchaseOrderService(makeNumbering(), makePdfGenerator(), emailSender);

    await runAsUser(db, () =>
      service.sendFollowUpEmail('po-1', { to: 'laura@proveedor.com', subject: 'Urgente', text: 'hola' }),
    );

    expect(emailSender.sendFollowUpEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Urgente' }),
    );
  });
});

describe('PurchaseOrderService.buildWhatsappLink', () => {
  it('builds a wa.me link with the digits-only phone and a prefilled message', async () => {
    const db = {
      purchaseOrder: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'po-1',
          number: 'OC-000001',
          total: new Prisma.Decimal(100),
          currency: { code: 'USD' },
          supplier: makeSupplier(),
          notes: null,
          createdAt: new Date(),
          transportMode: null,
          paymentTerm: null,
          deliveryTime: null,
          lines: [],
        }),
      },
    };
    const service = new PurchaseOrderService(makeNumbering(), makePdfGenerator(), makeEmailSender());

    const { url } = await runAsUser(db, () => service.buildWhatsappLink('po-1', '+54 9 11 2345-6789'));

    expect(url).toMatch(/^https:\/\/wa\.me\/5491123456789\?text=/);
  });

  it('rejects a phone with no digits at all', async () => {
    const db = {
      purchaseOrder: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'po-1',
          number: 'OC-000001',
          total: new Prisma.Decimal(1),
          currency: { code: 'USD' },
          supplier: makeSupplier(),
          notes: null,
          createdAt: new Date(),
          transportMode: null,
          paymentTerm: null,
          deliveryTime: null,
          lines: [],
        }),
      },
    };
    const service = new PurchaseOrderService(makeNumbering(), makePdfGenerator(), makeEmailSender());

    await expect(runAsUser(db, () => service.buildWhatsappLink('po-1', 'not-a-phone'))).rejects.toThrow(
      'Invalid WhatsApp number',
    );
  });
});
