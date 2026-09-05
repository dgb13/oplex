import type { DocumentLetter } from '@plexo/database';
import Jimp from 'jimp';
import jsQRImport from 'jsqr';

// Duplicado a propósito de CBTE_TIPO/MON_ID en
// libs/modules/invoicing/src/lib/afip-wsfe-client.ts, NO importado desde
// @plexo/invoicing: ese paquete no expone subpath exports, y su barrel
// (src/index.ts) arrastra invoicing.module -> invoice-pdf.service ->
// @react-pdf/renderer (ESM-only), que rompe la transformación de Jest en
// cualquier otro paquete que lo importe (probado - ver historial de esta
// sesión). Estas 2 tablas son chicas y estables (RG 4892 fijo) - si
// afip-wsfe-client.ts alguna vez agrega una letra/moneda nueva, actualizar
// acá también.
const CBTE_TIPO: Record<'FACTURA' | 'NOTA_CREDITO', Record<DocumentLetter, number>> = {
  FACTURA: { A: 1, B: 6, C: 11, M: 51 },
  NOTA_CREDITO: { A: 3, B: 8, C: 13, M: 53 },
};
const MON_ID: Record<string, string> = {
  ARS: 'PES',
  USD: 'DOL',
};

// jsqr es un bundle UMD sin "type":"module" en su package.json - bajo
// nodenext sin esModuleInterop, TS tipa mal el default import (lo ve como
// el namespace entero, no como la función). En runtime la interop CJS/ESM
// nativa de Node ya resuelve esto bien (jsQRImport ES la función) - este
// cast es sólo para el chequeo de tipos, no cambia el valor real.
const jsQR = jsQRImport as unknown as typeof import('jsqr').default;

export interface DecodedAfipQr {
  issueDate: string;
  issuerCuit: string;
  pointOfSale: string;
  // null = tipoCmp fuera de las 8 letras/kind que CBTE_TIPO mapea hoy
  // (ej. Nota de Débito, no emitida por este sistema todavía - ver
  // afip-wsfe-client.ts). El resto del payload sigue siendo válido.
  documentLetter: DocumentLetter | null;
  number: string;
  total: number;
  // null = moneda fuera de MON_ID (sólo ARS/USD mapeados hoy).
  currencyCode: string | null;
  exchangeRate: number;
  // null = Consumidor Final (docTipo 99) - sin tax id real que resolver.
  customerTaxId: string | null;
  cae: string;
}

const AFIP_QR_URL_PREFIX = 'https://www.afip.gob.ar/fe/qr/?p=';

function buildTipoCmpToDocumentLetter(): Map<number, DocumentLetter> {
  const map = new Map<number, DocumentLetter>();
  for (const kind of Object.keys(CBTE_TIPO) as (keyof typeof CBTE_TIPO)[]) {
    for (const letter of Object.keys(CBTE_TIPO[kind]) as DocumentLetter[]) {
      map.set(CBTE_TIPO[kind][letter], letter);
    }
  }
  return map;
}
const TIPO_CMP_TO_DOCUMENT_LETTER = buildTipoCmpToDocumentLetter();

function buildMonIdToCurrencyCode(): Map<string, string> {
  const map = new Map<string, string>();
  for (const [currencyCode, monId] of Object.entries(MON_ID)) {
    map.set(monId, currencyCode);
  }
  return map;
}
const MON_ID_TO_CURRENCY_CODE = buildMonIdToCurrencyCode();

/** Inverso simplificado de resolveDocTipoNro (@plexo/invoicing) - ese sólo
 * necesita ARMAR docTipo 80 (CUIT) ó 99 (Consumidor Final) para nuestras
 * propias facturas. Acá, leyendo el QR de un TERCERO, docTipo 99 sigue
 * significando "sin tax id real", cualquier otro valor (80=CUIT, 96=DNI,
 * etc.) simplemente devuelve el número tal cual - no hace falta distinguir
 * el tipo de documento para este flujo (sólo nos importa si hay o no un
 * tax id real que mostrar). */
function decodeDocTipoNro(docTipo: number, docNro: number): string | null {
  if (docTipo === 99) {
    return null;
  }
  return String(docNro);
}

/** Parsea el payload YA decodificado del contenido crudo de un QR (string).
 * Separado de decodeAfipQrFromImage para poder testear el parseo del
 * payload sin tener que generar una imagen de QR real en los tests. */
export function parseAfipQrPayload(rawQrContent: string): DecodedAfipQr | null {
  if (!rawQrContent.startsWith(AFIP_QR_URL_PREFIX)) {
    return null;
  }
  const base64 = rawQrContent.slice(AFIP_QR_URL_PREFIX.length);
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(Buffer.from(base64, 'base64').toString('utf-8'));
  } catch {
    return null;
  }

  return {
    issueDate: String(payload.fecha ?? ''),
    issuerCuit: String(payload.cuit ?? ''),
    pointOfSale: String(payload.ptoVta ?? ''),
    documentLetter: TIPO_CMP_TO_DOCUMENT_LETTER.get(Number(payload.tipoCmp)) ?? null,
    number: String(payload.nroCmp ?? ''),
    total: Number(payload.importe ?? 0),
    currencyCode: MON_ID_TO_CURRENCY_CODE.get(String(payload.moneda)) ?? null,
    exchangeRate: Number(payload.ctz ?? 1),
    customerTaxId: decodeDocTipoNro(Number(payload.tipoDocRec), Number(payload.nroDocRec)),
    cae: String(payload.codAut ?? ''),
  };
}

/** Decodifica el QR de AFIP (RG 4892) de una imagen (JPEG/PNG/WebP) - PDF no
 * soportado todavía (necesita rasterizar la página primero, ver
 * docs/plan-carga-comprobantes-ia.md, fuera de alcance de esta Fase 1).
 * Devuelve null si no hay QR legible - camino normal (foto sin QR nítido, o
 * un comprobante que de verdad no tiene QR), no un error: en ese caso todo
 * el resto del comprobante sale de la IA (ver AiInvoiceExtractionService). */
export async function decodeAfipQrFromImage(buffer: Buffer): Promise<DecodedAfipQr | null> {
  const image = await Jimp.read(buffer);
  const { data, width, height } = image.bitmap;
  const pixels = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
  const code = jsQR(pixels, width, height);
  if (!code) {
    return null;
  }
  return parseAfipQrPayload(code.data);
}
