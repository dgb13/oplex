import { parseAfipQrPayload } from './qr-decode.util.js';

const AFIP_QR_URL_PREFIX = 'https://www.afip.gob.ar/fe/qr/?p=';

// Mismos valores que CBTE_TIPO/MON_ID (RG 4892, fijos) - no importados de
// @plexo/invoicing a propósito, ver el comentario de duplicación en
// qr-decode.util.ts.
const CBTE_TIPO = { FACTURA: { A: 1, B: 6 } };
const MON_ID = { ARS: 'PES' };

function buildAfipQrUrl(payload: Record<string, unknown>): string {
  const base64 = Buffer.from(JSON.stringify(payload)).toString('base64');
  return `${AFIP_QR_URL_PREFIX}${base64}`;
}

describe('parseAfipQrPayload', () => {
  it('decodes a valid AFIP QR payload for a Factura A in ARS with a real customer CUIT', () => {
    const url = buildAfipQrUrl({
      ver: 1,
      fecha: '2026-09-01',
      cuit: 30716595549,
      ptoVta: 3,
      tipoCmp: CBTE_TIPO.FACTURA.A,
      nroCmp: 12345,
      importe: 18150,
      moneda: MON_ID.ARS,
      ctz: 1,
      tipoDocRec: 80,
      nroDocRec: 20270403949,
      tipoCodAut: 'E',
      codAut: 71234567890123,
    });

    const result = parseAfipQrPayload(url);

    expect(result).toEqual({
      issueDate: '2026-09-01',
      issuerCuit: '30716595549',
      pointOfSale: '3',
      documentLetter: 'A',
      number: '12345',
      total: 18150,
      currencyCode: 'ARS',
      exchangeRate: 1,
      customerTaxId: '20270403949',
      cae: '71234567890123',
    });
  });

  it('decodes a Consumidor Final receiver (tipoDocRec 99) as customerTaxId null', () => {
    const url = buildAfipQrUrl({
      fecha: '2026-09-01',
      cuit: 30716595549,
      ptoVta: 1,
      tipoCmp: CBTE_TIPO.FACTURA.B,
      nroCmp: 1,
      importe: 1000,
      moneda: MON_ID.ARS,
      ctz: 1,
      tipoDocRec: 99,
      nroDocRec: 0,
      codAut: 1,
    });

    const result = parseAfipQrPayload(url);

    expect(result?.customerTaxId).toBeNull();
  });

  it('returns documentLetter null for a tipoCmp outside the mapped set (e.g. a Nota de Débito, not issued by this system)', () => {
    const url = buildAfipQrUrl({
      fecha: '2026-09-01',
      cuit: 30716595549,
      ptoVta: 1,
      tipoCmp: 2, // Nota de Débito A - fuera de CBTE_TIPO
      nroCmp: 1,
      importe: 1000,
      moneda: MON_ID.ARS,
      ctz: 1,
      tipoDocRec: 99,
      nroDocRec: 0,
      codAut: 1,
    });

    const result = parseAfipQrPayload(url);

    expect(result?.documentLetter).toBeNull();
  });

  it('returns currencyCode null for a moneda outside MON_ID (unmapped currency)', () => {
    const url = buildAfipQrUrl({
      fecha: '2026-09-01',
      cuit: 30716595549,
      ptoVta: 1,
      tipoCmp: CBTE_TIPO.FACTURA.B,
      nroCmp: 1,
      importe: 1000,
      moneda: 'EUR',
      ctz: 1,
      tipoDocRec: 99,
      nroDocRec: 0,
      codAut: 1,
    });

    const result = parseAfipQrPayload(url);

    expect(result?.currencyCode).toBeNull();
  });

  it('returns null for a URL that is not an AFIP QR url', () => {
    expect(parseAfipQrPayload('https://example.com/not-a-qr')).toBeNull();
  });

  it('returns null when the decoded payload is not valid JSON', () => {
    const notJson = Buffer.from('this is not json').toString('base64');
    expect(parseAfipQrPayload(`${AFIP_QR_URL_PREFIX}${notJson}`)).toBeNull();
  });
});
