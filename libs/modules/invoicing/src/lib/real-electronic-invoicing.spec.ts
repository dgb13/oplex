import { BadGatewayException, BadRequestException } from '@nestjs/common';
import type { AfipCredentialsService } from '@plexo/afip-credentials';
import { Prisma } from '@plexo/database';
import { explainArcaError, RealElectronicInvoicingService } from './real-electronic-invoicing.js';
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
    customerTaxCondition: null,
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

describe('explainArcaError', () => {
  it('explica el punto de venta no habilitado para Web Services', () => {
    const raw = 'ARCA WSFE: [11002] El punto de venta no se encuentra habilitado a usar en el presente WS. Ver metodo FEParamGetPtosVenta';
    const text = explainArcaError(raw, '1');
    expect(text).toMatch(/^El punto de venta 0001 no está habilitado para Web Services en ARCA\. Revisá el número en Sucursales/);
    expect(text).toContain(`Detalle de ARCA: ${raw}`);
  });

  it('deja el resto como lo manda ARCA', () => {
    expect(explainArcaError('ARCA WSFE: [600] ValidacionDeToken', '1')).toBe('ARCA WSFE: [600] ValidacionDeToken');
  });
});
