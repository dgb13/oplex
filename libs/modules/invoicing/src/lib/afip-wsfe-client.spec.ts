import { Prisma } from '@plexo/database';
import forge from 'node-forge';
import { AfipWsfeClient, resolveCondicionIvaReceptor } from './afip-wsfe-client.js';
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
      customerTaxCondition: 'Responsable Inscripto',
      customerName: 'Cliente Test SA',
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
    expect(wsfeBody).toContain('<ar:Id>5</ar:Id>'); // 21% -> alicuota 5
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
    expect(wsfeBody).not.toContain('<ar:Tributos>');
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
    expect(wsfeBody).toContain('<ar:Tributos>');
    expect(wsfeBody).toContain('<ar:Tributo><ar:Id>2</ar:Id><ar:Desc>Percepción IIBB &amp; CABA</ar:Desc><ar:BaseImp>100.00</ar:BaseImp><ar:Alic>21.00</ar:Alic><ar:Importe>21.00</ar:Importe></ar:Tributo>');
    expect(wsfeBody).toContain('<ar:Tributo><ar:Id>99</ar:Id><ar:Desc>Otro</ar:Desc><ar:BaseImp>100.00</ar:BaseImp><ar:Alic>9.00</ar:Alic><ar:Importe>9.00</ar:Importe></ar:Tributo>');
    // Tributos va después de CbtesAsoc y antes de Iva, según el orden del
    // XSD real de FECAEDetRequest.
    expect(wsfeBody.indexOf('<ar:Tributos>')).toBeLessThan(wsfeBody.indexOf('<ar:Iva>'));
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

  it('sends CondicionIVAReceptorId (RG 5616): 5 for Consumidor Final, mapped from the customer condition otherwise', async () => {
    for (const [overrides, expected] of [
      [{ customerTaxId: null, customerTaxCondition: null }, 5],
      [{ customerTaxCondition: 'IVA Responsable Inscripto' }, 1],
      [{ customerTaxCondition: 'Responsable Monotributo' }, 6],
      [{ customerTaxCondition: 'IVA Sujeto Exento' }, 4],
    ] as const) {
      fetchMock.mockReset();
      fetchMock
        .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(wsaaResponse()) })
        .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(wsfeAcceptedResponse()) });
      await new AfipWsfeClient({ certPem, keyPem, env: 'homologacion', cuitRepresentada: '20111111112' }).requestCae(
        baseInvoice(overrides),
      );
      const wsfeBody = fetchMock.mock.calls[1][1].body as string;
      expect(wsfeBody).toContain(`<ar:CondicionIVAReceptorId>${expected}</ar:CondicionIVAReceptorId>`);
    }
  });

  it('refuses to guess the receptor condition for a CUIT customer without one', () => {
    expect(() => resolveCondicionIvaReceptor('20111111112', null, 'Acme SA')).toThrow(/condición frente al IVA del cliente "Acme SA"/);
  });

  it('follows the WSDL element order (ImpTrib before ImpIVA, service dates before MonId, CondicionIVAReceptorId after MonCotiz)', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(wsaaResponse()) })
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(wsfeAcceptedResponse()) });
    const client = new AfipWsfeClient({ certPem, keyPem, env: 'homologacion', cuitRepresentada: '20111111112' });

    await client.requestCae(baseInvoice({ concept: 'SERVICIOS' }));

    const body = fetchMock.mock.calls[1][1].body as string;
    const at = (tag: string) => body.indexOf(`<ar:${tag}>`);
    expect(at('ImpTrib')).toBeLessThan(at('ImpIVA'));
    expect(at('FchVtoPago')).toBeLessThan(at('MonId'));
    expect(at('MonCotiz')).toBeLessThan(at('CondicionIVAReceptorId'));
    expect(at('CondicionIVAReceptorId')).toBeLessThan(body.indexOf('<ar:Iva>'));
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
    expect(wsfeBody).not.toContain('<ar:Iva>');
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
    expect(wsfeBody).toContain('<ar:CbtesAsoc>');
    expect(wsfeBody).toContain('<ar:Tipo>6</ar:Tipo>'); // original Factura B
    expect(wsfeBody).toContain('<ar:Nro>42</ar:Nro>');
  });

  it('todos los elementos del body van con prefijo ar: (sin prefijo ARCA los ignora - pasó con CbtesAsoc, IVA y Tributos)', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(wsaaResponse()) })
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(wsfeAcceptedResponse()) });
    const client = new AfipWsfeClient({ certPem, keyPem, env: 'homologacion', cuitRepresentada: '20111111112' });

    await client.requestCae(
      baseInvoice({
        kind: 'NOTA_CREDITO',
        associatedVoucher: { documentLetter: 'B', pointOfSale: '0001', number: '00000042' },
        otherTaxes: [
          {
            id: 2,
            desc: 'Percepción IIBB',
            baseImp: new Prisma.Decimal(100),
            alic: new Prisma.Decimal(3),
            importe: new Prisma.Decimal(3),
          },
        ],
      }),
    );

    const wsfeBody = fetchMock.mock.calls[1][1].body as string;
    const unprefixed = wsfeBody.match(/<\/?(?!ar:|soapenv:|\?xml)[A-Za-z][\w]*/g);
    expect(unprefixed).toBeNull();
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

  function fecompConsultarResponse(resultGet: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <FECompConsultarResponse>
      <FECompConsultarResult>
        <ResultGet>${resultGet}</ResultGet>
      </FECompConsultarResult>
    </FECompConsultarResponse>
  </soapenv:Body>
</soapenv:Envelope>`;
  }

  it('FECompConsultar: lee el detalle completo para emitir una nota de crédito espejo', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(wsaaResponse()) })
      .mockResolvedValueOnce({
        ok: true,
        text: () =>
          Promise.resolve(
            fecompConsultarResponse(`
          <Concepto>1</Concepto><DocTipo>80</DocTipo><DocNro>20111111112</DocNro>
          <CbteDesde>3</CbteDesde><CbteFch>20261001</CbteFch>
          <ImpTotal>133.1</ImpTotal><ImpTotConc>0</ImpTotConc><ImpNeto>100</ImpNeto><ImpOpEx>0</ImpOpEx>
          <ImpTrib>12.1</ImpTrib><ImpIVA>21</ImpIVA><MonId>PES</MonId><MonCotiz>1</MonCotiz>
          <CondicionIVAReceptorId>1</CondicionIVAReceptorId>
          <Iva><AlicIva><Id>5</Id><BaseImp>100</BaseImp><Importe>21</Importe></AlicIva></Iva>
          <Tributos><Tributo><Id>2</Id><Desc>Percepción IIBB</Desc><BaseImp>100</BaseImp><Alic>12.1</Alic><Importe>12.1</Importe></Tributo></Tributos>
          <CodAutorizacion>86400939983525</CodAutorizacion>`),
          ),
      });
    const client = new AfipWsfeClient({ certPem, keyPem, env: 'homologacion', cuitRepresentada: '20-11111111-2' });

    const voucher = await client.getAuthorizedVoucher(1, 6, 3);

    const body = fetchMock.mock.calls[1][1].body as string;
    expect(body).toContain('<ar:CbteTipo>6</ar:CbteTipo>');
    expect(body).toContain('<ar:CbteNro>3</ar:CbteNro>');
    expect(voucher.cae).toBe('86400939983525');
    expect(voucher.detail).toEqual(
      expect.objectContaining({
        concept: 'PRODUCTOS',
        customerTaxId: '20111111112',
        condicionIvaReceptorId: 1,
        currencyCode: 'ARS',
      }),
    );
    expect(voucher.detail?.total.toNumber()).toBe(133.1);
    expect(voucher.detail?.taxLines).toHaveLength(1);
    expect(voucher.detail?.taxLines[0].rate.toNumber()).toBe(21);
    expect(voucher.detail?.otherTaxes[0]).toEqual(expect.objectContaining({ id: 2, desc: 'Percepción IIBB' }));
  });

  it('FECompConsultar: sin detalle si ARCA usó algo que Oplex no sabe mapear (otra moneda)', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(wsaaResponse()) })
      .mockResolvedValueOnce({
        ok: true,
        text: () =>
          Promise.resolve(
            fecompConsultarResponse(
              '<Concepto>1</Concepto><DocTipo>99</DocTipo><DocNro>0</DocNro><ImpTotal>16</ImpTotal><MonId>060</MonId><CodAutorizacion>1</CodAutorizacion>',
            ),
          ),
      });
    const client = new AfipWsfeClient({ certPem, keyPem, env: 'homologacion', cuitRepresentada: '20-11111111-2' });

    const voucher = await client.getAuthorizedVoucher(1, 11, 3);

    expect(voucher.cae).toBe('1');
    expect(voucher.detail).toBeNull();
  });

  it('clase C: todo va en ImpNeto y ImpOpEx/ImpTotConc/ImpIVA en 0 (manual WSFEv1, errores 10043/10044/10047)', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(wsaaResponse()) })
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(wsfeAcceptedResponse()) });
    const client = new AfipWsfeClient({ certPem, keyPem, env: 'homologacion', cuitRepresentada: '20111111112' });

    await client.requestCae(
      baseInvoice({
        documentLetter: 'C',
        customerTaxId: null,
        netAmount: new Prisma.Decimal(80),
        exemptAmount: new Prisma.Decimal(15),
        nonTaxedAmount: new Prisma.Decimal(5),
        taxAmount: new Prisma.Decimal(0),
        total: new Prisma.Decimal(100),
        taxLines: [],
      }),
    );

    const wsfeBody = fetchMock.mock.calls[1][1].body as string;
    expect(wsfeBody).toContain('<ar:CbteTipo>11</ar:CbteTipo>');
    expect(wsfeBody).toContain('<ar:ImpNeto>100.00</ar:ImpNeto>');
    expect(wsfeBody).toContain('<ar:ImpOpEx>0.00</ar:ImpOpEx>');
    expect(wsfeBody).toContain('<ar:ImpTotConc>0.00</ar:ImpTotConc>');
    expect(wsfeBody).toContain('<ar:ImpIVA>0.00</ar:ImpIVA>');
    expect(wsfeBody).toContain('<ar:ImpTotal>100.00</ar:ImpTotal>');
    expect(wsfeBody).not.toContain('<ar:Iva>');
  });

  it('clase C con IVA no se manda a ARCA: es un error de quien la armó', async () => {
    const client = new AfipWsfeClient({ certPem, keyPem, env: 'homologacion', cuitRepresentada: '20111111112' });

    await expect(
      client.requestCae(baseInvoice({ documentLetter: 'C', customerTaxId: null, taxLines: [] })),
    ).rejects.toThrow(/clase C no puede llevar IVA/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
