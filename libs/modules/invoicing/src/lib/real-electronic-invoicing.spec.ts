import { BadGatewayException, BadRequestException } from '@nestjs/common';
import type { AfipCredentialsService } from '@plexo/afip-credentials';
import { Prisma } from '@plexo/database';
import { RealElectronicInvoicingService } from './real-electronic-invoicing.js';
import type { ElectronicInvoiceRequest } from './electronic-invoicing.port.js';

function makeInvoice(): ElectronicInvoiceRequest {
  return {
    kind: 'FACTURA',
    documentLetter: 'B',
    concept: 'PRODUCTOS',
    pointOfSale: '0001',
    number: '00000001',
    issueDate: new Date('2026-01-01'),
    dueDate: null,
    customerTaxId: null,
    currencyCode: 'ARS',
    exchangeRate: new Prisma.Decimal(1),
    netAmount: new Prisma.Decimal(100),
    exemptAmount: new Prisma.Decimal(0),
    nonTaxedAmount: new Prisma.Decimal(0),
    taxAmount: new Prisma.Decimal(21),
    total: new Prisma.Decimal(121),
    taxLines: [],
  };
}

describe('RealElectronicInvoicingService.requestCae', () => {
  it('throws a clear, actionable error when the tenant has no AFIP certificate configured', async () => {
    const afipCredentials = { getCurrent: jest.fn().mockResolvedValue(null) } as unknown as AfipCredentialsService;
    const service = new RealElectronicInvoicingService(afipCredentials);

    await expect(service.requestCae(makeInvoice())).rejects.toThrow(BadRequestException);
    await expect(service.requestCae(makeInvoice())).rejects.toThrow(/certificado ARCA/);
  });

  it('wraps an AFIP-side failure (unreachable, rejected cert, ...) as a 502, not a raw 500', async () => {
    const afipCredentials = {
      getCurrent: jest.fn().mockResolvedValue({
        certPem: 'not a real cert',
        keyPem: 'not a real key',
        cuitRepresentada: '20111111112',
        env: 'homologacion',
      }),
    } as unknown as AfipCredentialsService;
    const service = new RealElectronicInvoicingService(afipCredentials);

    await expect(service.requestCae(makeInvoice())).rejects.toThrow(BadGatewayException);
  });
});
