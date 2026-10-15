import type { DocumentLetter, Prisma } from '@plexo/database';
import QRCode from 'qrcode';
import { CBTE_TIPO, resolveDocTipoNro, resolveMonId } from '../afip-wsfe-client.js';

const AFIP_QR_BASE_URL = 'https://www.afip.gob.ar/fe/qr/?p=';

export interface AfipQrInput {
  /** Sin indicar = factura. */
  kind?: 'FACTURA' | 'NOTA_CREDITO';
  issueDate: Date;
  issuerCuit: string;
  pointOfSale: string;
  documentLetter: DocumentLetter;
  number: string;
  total: Pick<Prisma.Decimal, 'toNumber'>;
  currencyCode: string;
  exchangeRate: Pick<Prisma.Decimal, 'toNumber'>;
  customerTaxId: string | null;
  cae: string;
}

/** RG 4892 - código QR obligatorio en toda Factura Electrónica desde 2021.
 * El payload (antes de base64) es siempre el mismo shape documentado por
 * AFIP, sin importar el tamaño de papel (A4/A5/ticket) - se genera una sola
 * vez y se embebe como imagen en cualquiera de los 3 templates. */
export function buildAfipQrUrl(input: AfipQrInput): string {
  const { docTipo, docNro } = resolveDocTipoNro(input.customerTaxId);
  const payload = {
    ver: 1,
    fecha: input.issueDate.toISOString().slice(0, 10),
    cuit: Number(input.issuerCuit.replace(/\D/g, '')),
    ptoVta: Number(input.pointOfSale),
    tipoCmp: CBTE_TIPO[input.kind ?? 'FACTURA'][input.documentLetter],
    nroCmp: Number(input.number),
    importe: input.total.toNumber(),
    moneda: resolveMonId(input.currencyCode),
    ctz: input.exchangeRate.toNumber(),
    tipoDocRec: docTipo,
    nroDocRec: Number(docNro),
    tipoCodAut: 'E',
    codAut: Number(input.cae),
  };
  const base64 = Buffer.from(JSON.stringify(payload)).toString('base64');
  return `${AFIP_QR_BASE_URL}${base64}`;
}

/** PNG data-URI del QR - @react-pdf/renderer lo consume directo vía
 * <Image src={dataUri} />, no hace falta escribir ningún archivo a disco. */
export async function buildAfipQrDataUri(input: AfipQrInput): Promise<string> {
  const url = buildAfipQrUrl(input);
  return QRCode.toDataURL(url, { margin: 1, width: 200 });
}
