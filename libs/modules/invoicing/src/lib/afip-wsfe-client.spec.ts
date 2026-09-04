import { Prisma } from '@plexo/database';
import forge from 'node-forge';
import { AfipWsfeClient } from './afip-wsfe-client.js';
import type { ElectronicInvoiceRequest } from './electronic-invoicing.port.js';

function escapeXml(xml: string): string {
  return xml.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function wsaaResponse(): string {
  const inner = `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketResponse version="1.0">
  <header>
    <expirationTime>2099-01-01T00:00:00-03:00</expirationTime>
  </header>
  <credentials>
    <token>TOKEN123</token>
    <sign>SIGN123</sign>
  </credentials>
</loginTicketResponse>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <loginCmsResponse>
      <loginCmsReturn>${escapeXml(inner)}</loginCmsReturn>
    </loginCmsResponse>
  </soapenv:Body>
</soapenv:Envelope>`;
}

function wsfeAcceptedResponse(cae = '67890123456789', vto = '20301231'): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <FECAESolicitarResponse>
      <FECAESolicitarResult>
        <FeDetResp>
          <FECAEDetResponse>
            <Resultado>A</Resultado>
            <CAE>${cae}</CAE>
            <CAEFchVto>${vto}</CAEFchVto>
          </FECAEDetResponse>
        </FeDetResp>
      </FECAESolicitarResult>
    </FECAESolicitarResponse>
  </soapenv:Body>
</soapenv:Envelope>`;
}

function wsfeRejectedResponse(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <FECAESolicitarResponse>
      <FECAESolicitarResult>
        <FeDetResp>
          <FECAEDetResponse>
            <Resultado>R</Resultado>
          </FECAEDetResponse>
        </FeDetResp>
        <Errors>
          <Err>
            <Code>10192</Code>
            <Msg>CUIT representado no coincide con informado en TA</Msg>
          </Err>
        </Errors>
      </FECAESolicitarResult>
    </FECAESolicitarResponse>
  </soapenv:Body>
</soapenv:Envelope>`;
}

describe('AfipWsfeClient.requestCae', () => {
  let certPem: string;
  let keyPem: string;
  let fetchMock: jest.Mock;
  const originalFetch = global.fetch;

  beforeAll(() => {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date('2026-01-01');
    cert.validity.notAfter = new Date('2027-01-01');
    const attrs = [{ name: 'commonName', value: 'test' }];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.sign(keys.privateKey);
    certPem = forge.pki.certificateToPem(cert);
    keyPem = forge.pki.privateKeyToPem(keys.privateKey);
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  function baseInvoice(overrides: Partial<ElectronicInvoiceRequest> = {}): ElectronicInvoiceRequest {
    return {
      kind: 'FACTURA',
      documentLetter: 'B',
      concept: 'PRODUCTOS',
      pointOfSale: '0001',
      number: '00000042',
      issueDate: new Date('2026-06-15T12:00:00Z'),
      dueDate: null,
      customerTaxId: '20111111112',
      currencyCode: 'ARS',
      exchangeRate: new Prisma.Decimal(1),
      netAmount: new Prisma.Decimal(100),
      exemptAmount: new Prisma.Decimal(0),
      nonTaxedAmount: new Prisma.Decimal(0),
      taxAmount: new Prisma.Decimal(21),
      total: new Prisma.Decimal(121),
      taxLines: [{ rate: new Prisma.Decimal(21), netAmount: new Prisma.Decimal(100), taxAmount: new Prisma.Decimal(21) }],
      ...overrides,
    };
  }

  it('authenticates via WSAA, requests a CAE and parses the accepted response', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(wsaaResponse()) })
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(wsfeAcceptedResponse()) });

    const client = new AfipWsfeClient({
      certPem,
      keyPem,
      env: 'homologacion',
      cuitRepresentada: '20-11111111-2',
    });

    const result = await client.requestCae(baseInvoice());

    expect(result.cae).toBe('67890123456789');
    expect(result.caeExpiry).toEqual(new Date(Date.UTC(2030, 11, 31)));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const wsfeBody = fetchMock.mock.calls[1][1].body as string;
    expect(wsfeBody).toContain('<ar:PtoVta>0001</ar:PtoVta>');
    expect(wsfeBody).toContain('<ar:CbteTipo>6</ar:CbteTipo>'); // Factura B
    expect(wsfeBody).toContain('<ar:DocTipo>80</ar:DocTipo>');
    expect(wsfeBody).toContain('<ar:DocNro>20111111112</ar:DocNro>');
    expect(wsfeBody).toContain('<ar:CbteDesde>42</ar:CbteDesde>');
    expect(wsfeBody).toContain('<ar:ImpTotal>121.00</ar:ImpTotal>');
    expect(wsfeBody).toContain('<ar:MonId>PES</ar:MonId>');
    expect(wsfeBody).toContain('<Id>5</Id>'); // 21% -> alicuota 5
    expect(wsfeBody).toContain('<ar:Concepto>1</ar:Concepto>');
    expect(wsfeBody).not.toContain('FchServDesde'); // Concepto 1: AFIP rejects these if present
    expect(wsfeBody).toContain('<ar:ImpTotConc>0.00</ar:ImpTotConc>');
    expect(wsfeBody).toContain('<ar:ImpOpEx>0.00</ar:ImpOpEx>');
  });

  it('reports exemptAmount/nonTaxedAmount as ImpOpEx/ImpTotConc, separate from ImpNeto', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(wsaaResponse()) })
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(wsfeAcceptedResponse()) });
    const client = new AfipWsfeClient({ certPem, keyPem, env: 'homologacion', cuitRepresentada: '20111111112' });

    await client.requestCae(
      baseInvoice({
        netAmount: new Prisma.Decimal(100),
        exemptAmount: new Prisma.Decimal(50),
        nonTaxedAmount: new Prisma.Decimal(30),
        taxAmount: new Prisma.Decimal(21),
        total: new Prisma.Decimal(201),
      }),
    );

    const wsfeBody = fetchMock.mock.calls[1][1].body as string;
    expect(wsfeBody).toContain('<ar:ImpNeto>100.00</ar:ImpNeto>');
    expect(wsfeBody).toContain('<ar:ImpOpEx>50.00</ar:ImpOpEx>');
    expect(wsfeBody).toContain('<ar:ImpTotConc>30.00</ar:ImpTotConc>');
    expect(wsfeBody).toContain('<ar:ImpTotal>201.00</ar:ImpTotal>');
  });

  it('sends 0.00 ImpTrib and no Tributos block when the invoice has no otherTaxes', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(wsaaResponse()) })
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(wsfeAcceptedResponse()) });
    const client = new AfipWsfeClient({ certPem, keyPem, env: 'homologacion', cuitRepresentada: '20111111112' });

    await client.requestCae(baseInvoice());

    const wsfeBody = fetchMock.mock.calls[1][1].body as string;
    expect(wsfeBody).toContain('<ar:ImpTrib>0.00</ar:ImpTrib>');
    expect(wsfeBody).not.toContain('<Tributos>');
  });

  it('sends a Tributos block per otherTax and sums ImpTrib - never the hardcoded 0.00', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(wsaaResponse()) })
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(wsfeAcceptedResponse()) });
    const client = new AfipWsfeClient({ certPem, keyPem, env: 'homologacion', cuitRepresentada: '20111111112' });

    await client.requestCae(
      baseInvoice({
        total: new Prisma.Decimal(151),
        otherTaxes: [
          {
            id: 2,
            desc: 'Percepción IIBB & CABA',
            baseImp: new Prisma.Decimal(100),
            alic: new Prisma.Decimal(21),
            importe: new Prisma.Decimal(21),
          },
          { id: 99, desc: 'Otro', baseImp: new Prisma.Decimal(100), alic: new Prisma.Decimal(9), importe: new Prisma.Decimal(9) },
        ],
      }),
    );

    const wsfeBody = fetchMock.mock.calls[1][1].body as string;
    expect(wsfeBody).toContain('<ar:ImpTrib>30.00</ar:ImpTrib>');
    expect(wsfeBody).toContain('<Tributos>');
    expect(wsfeBody).toContain('<Tributo><Id>2</Id><Desc>Percepción IIBB &amp; CABA</Desc><BaseImp>100.00</BaseImp><Alic>21.00</Alic><Importe>21.00</Importe></Tributo>');
    expect(wsfeBody).toContain('<Tributo><Id>99</Id><Desc>Otro</Desc><BaseImp>100.00</BaseImp><Alic>9.00</Alic><Importe>9.00</Importe></Tributo>');
    // Tributos va después de CbtesAsoc y antes de Iva, según el orden del
    // XSD real de FECAEDetRequest.
    expect(wsfeBody.indexOf('<Tributos>')).toBeLessThan(wsfeBody.indexOf('<Iva>'));
  });

  it('sends Concepto 2 and FchServDesde/FchServHasta/FchVtoPago for a service invoice', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(wsaaResponse()) })
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(wsfeAcceptedResponse()) });
    const client = new AfipWsfeClient({ certPem, keyPem, env: 'homologacion', cuitRepresentada: '20111111112' });

    await client.requestCae(
      baseInvoice({ concept: 'SERVICIOS', dueDate: new Date('2026-07-01T00:00:00Z') }),
    );

    const wsfeBody = fetchMock.mock.calls[1][1].body as string;
    expect(wsfeBody).toContain('<ar:Concepto>2</ar:Concepto>');
    expect(wsfeBody).toContain('<ar:FchServDesde>20260615</ar:FchServDesde>');
    expect(wsfeBody).toContain('<ar:FchServHasta>20260615</ar:FchServHasta>');
    expect(wsfeBody).toContain('<ar:FchVtoPago>20260701</ar:FchVtoPago>'); // from dueDate
  });

  it('sends Concepto 3 for a mixed products+services invoice, falling back FchVtoPago to issueDate when there is no dueDate', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(wsaaResponse()) })
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(wsfeAcceptedResponse()) });
    const client = new AfipWsfeClient({ certPem, keyPem, env: 'homologacion', cuitRepresentada: '20111111112' });

    await client.requestCae(baseInvoice({ concept: 'PRODUCTOS_Y_SERVICIOS', dueDate: null }));

    const wsfeBody = fetchMock.mock.calls[1][1].body as string;
    expect(wsfeBody).toContain('<ar:Concepto>3</ar:Concepto>');
    expect(wsfeBody).toContain('<ar:FchVtoPago>20260615</ar:FchVtoPago>'); // same as issueDate
  });

  it('maps Consumidor Final (no customerTaxId) to DocTipo 99 / DocNro 0', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(wsaaResponse()) })
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(wsfeAcceptedResponse()) });
    const client = new AfipWsfeClient({ certPem, keyPem, env: 'homologacion', cuitRepresentada: '20111111112' });

    await client.requestCae(baseInvoice({ customerTaxId: null }));

    const wsfeBody = fetchMock.mock.calls[1][1].body as string;
    expect(wsfeBody).toContain('<ar:DocTipo>99</ar:DocTipo>');
    expect(wsfeBody).toContain('<ar:DocNro>0</ar:DocNro>');
  });

  it('omits the Iva breakdown for Factura C (Monotributo)', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(wsaaResponse()) })
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(wsfeAcceptedResponse()) });
    const client = new AfipWsfeClient({ certPem, keyPem, env: 'homologacion', cuitRepresentada: '20111111112' });

    await client.requestCae(
      baseInvoice({ documentLetter: 'C', taxAmount: new Prisma.Decimal(0), taxLines: [] }),
    );

    const wsfeBody = fetchMock.mock.calls[1][1].body as string;
    expect(wsfeBody).not.toContain('<Iva>');
    expect(wsfeBody).toContain('<ar:CbteTipo>11</ar:CbteTipo>'); // Factura C
  });

  it('includes CbtesAsoc for a Nota de Crédito referencing the original invoice', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(wsaaResponse()) })
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(wsfeAcceptedResponse()) });
    const client = new AfipWsfeClient({ certPem, keyPem, env: 'homologacion', cuitRepresentada: '20111111112' });

    await client.requestCae(
      baseInvoice({
        kind: 'NOTA_CREDITO',
        associatedVoucher: { documentLetter: 'B', pointOfSale: '0001', number: '00000042' },
      }),
    );

    const wsfeBody = fetchMock.mock.calls[1][1].body as string;
    expect(wsfeBody).toContain('<ar:CbteTipo>8</ar:CbteTipo>'); // Nota de Crédito B
    expect(wsfeBody).toContain('<CbtesAsoc>');
    expect(wsfeBody).toContain('<Tipo>6</Tipo>'); // original Factura B
    expect(wsfeBody).toContain('<Nro>42</Nro>');
  });

  it('throws with AFIP error details when the voucher is rejected', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(wsaaResponse()) })
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(wsfeRejectedResponse()) });
    const client = new AfipWsfeClient({ certPem, keyPem, env: 'homologacion', cuitRepresentada: '20111111112' });

    await expect(client.requestCae(baseInvoice())).rejects.toThrow(/10192/);
  });

  it('rejects an unmapped currency before calling AFIP', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(wsaaResponse()) });
    const client = new AfipWsfeClient({ certPem, keyPem, env: 'homologacion', cuitRepresentada: '20111111112' });

    await expect(client.requestCae(baseInvoice({ currencyCode: 'EUR' }))).rejects.toThrow(/MonId/);
  });

  it('rejects an IVA rate AFIP does not recognize', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(wsaaResponse()) });
    const client = new AfipWsfeClient({ certPem, keyPem, env: 'homologacion', cuitRepresentada: '20111111112' });

    await expect(
      client.requestCae(
        baseInvoice({
          taxLines: [{ rate: new Prisma.Decimal(15), netAmount: new Prisma.Decimal(100), taxAmount: new Prisma.Decimal(15) }],
        }),
      ),
    ).rejects.toThrow(/Alícuota/);
  });
});
