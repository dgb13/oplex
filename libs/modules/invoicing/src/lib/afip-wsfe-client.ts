import { AfipWsaaClient, type AfipWsaaCredentials } from '@plexo/afip-credentials';
import type { DocumentLetter, InvoiceConcept, Prisma } from '@plexo/database';
import { XMLParser } from 'fast-xml-parser';
import type {
  ElectronicInvoiceRequest,
  ElectronicInvoiceResult,
} from './electronic-invoicing.port.js';

const WSFE_SERVICE = 'wsfe';

const WSFE_URL: Record<AfipWsaaCredentials['env'], string> = {
  homologacion: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
  produccion: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
};

const xmlParser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });

/** Factura/Nota de Crédito CbteTipo per DocumentLetter - the only two
 * fiscal-document families this app issues (no Nota de Débito, no
 * Bienes Usados/Exportación/FCE variants). Exported - also needed to build
 * the AFIP QR payload (RG 4892, tipoCmp) in @plexo/invoicing's pdf module,
 * still intra-module so it doesn't break the "never cross-module import"
 * rule. */
export const CBTE_TIPO: Record<'FACTURA' | 'NOTA_CREDITO', Record<DocumentLetter, number>> = {
  FACTURA: { A: 1, B: 6, C: 11, M: 51 },
  NOTA_CREDITO: { A: 3, B: 8, C: 13, M: 53 },
};

/** AFIP's alicuota IDs for the 4 standard IVA rates - the only ones this
 * app's TaxDefinition model is expected to use (see resolveTaxRate in
 * invoicing.service.ts). Keyed by rate.toFixed(1) so 21.00/10.50/0.00/27.00
 * all normalize to a stable string ("21.0", "10.5", "0.0", "27.0"). */
const CONCEPTO_ID: Record<InvoiceConcept, number> = {
  PRODUCTOS: 1,
  SERVICIOS: 2,
  PRODUCTOS_Y_SERVICIOS: 3,
};

const IVA_ALICUOTA_ID: Record<string, number> = {
  '0.0': 3,
  '10.5': 4,
  '21.0': 5,
  '27.0': 6,
};

/** AFIP's own currency vocabulary (MonId), not ISO 4217 - only the two
 * codes this app's seed/demo data actually uses are mapped; anything else
 * is rejected rather than silently guessed, since sending the wrong MonId
 * to AFIP produces a real fiscal document with the wrong currency. */
const MON_ID: Record<string, string> = {
  ARS: 'PES',
  USD: 'DOL',
};

/** Exportado - reusado por el QR de AFIP (RG 4892, campo "moneda"). */
export function resolveMonId(currencyCode: string): string {
  const monId = MON_ID[currencyCode.toUpperCase()];
  if (!monId) {
    throw new Error(
      `Moneda "${currencyCode}" no tiene un MonId de AFIP mapeado (sólo ARS/USD por ahora)`,
    );
  }
  return monId;
}

/** Exportado - reusado por el QR de AFIP (RG 4892, campos "tipoDocRec"/
 * "nroDocRec"). */
export function resolveDocTipoNro(customerTaxId: string | null): { docTipo: number; docNro: string } {
  if (!customerTaxId) {
    return { docTipo: 99, docNro: '0' }; // Consumidor Final
  }
  const digits = customerTaxId.replace(/\D/g, '');
  return { docTipo: 80, docNro: digits }; // CUIT
}

function resolveIvaId(rate: Prisma.Decimal): number {
  const key = rate.toFixed(1);
  const id = IVA_ALICUOTA_ID[key];
  if (!id) {
    throw new Error(`Alícuota de IVA ${key}% no reconocida por AFIP (0/10.5/21/27)`);
  }
  return id;
}

function formatFecha(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

function formatImporte(amount: Prisma.Decimal): string {
  return amount.toFixed(2);
}

// Tributo.Desc es el único texto libre (elegido por el usuario al facturar,
// ver CreateInvoiceTaxLineDto.concept) que termina en este SOAP body - todo
// lo demás es numérico/enum/generado por el servidor. Escapar para no
// romper el XML con un "&"/"<" en el concepto.
function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

interface WsfeError {
  Code: number | string;
  Msg: string;
}

/**
 * Real WSFE (facturación electrónica) client - FECAESolicitar only, the one
 * operation this app needs (issue a voucher, get a CAE back). Deliberately
 * simplified vs. the full WSFE surface:
 *  - Concepto (Productos/Servicios/ambos) is derived upstream from
 *    Article.isService and sent through as-is (see InvoicingService) - this
 *    client only maps it to AFIP's numeric id and, when it's not
 *    "Productos", appends FchServDesde/FchServHasta/FchVtoPago (AFIP
 *    rejects the request if those are present for Concepto 1, or missing
 *    for 2/3). No real service-period tracking exists yet (no "rendered
 *    from/to" dates anywhere in the model) - see ElectronicInvoiceRequest's
 *    dueDate docstring for the same-day fallback this uses instead.
 *  - DocTipo is always CUIT (80) or Consumidor Final (99) - Company.taxId
 *    doesn't model DNI/CUIL customers.
 *  - ImpOpEx/ImpTotConc (exempt / non-taxed amounts) come straight from
 *    ElectronicInvoiceRequest.exemptAmount/nonTaxedAmount, derived upstream
 *    from TaxCalculationType.EXENTO/NO_GRAVADO (see InvoicingService) - this
 *    client doesn't decide which lines qualify, only reports the totals.
 *  - MonId only covers ARS/USD (see MON_ID above).
 * Any of these would need real modeling upstream (Article/TaxDefinition/
 * Currency) before this client could stop assuming them.
 */
export class AfipWsfeClient {
  private readonly wsaa: AfipWsaaClient;
  private readonly url: string;

  constructor(private readonly credentials: AfipWsaaCredentials & { cuitRepresentada: string }) {
    this.wsaa = new AfipWsaaClient(credentials);
    this.url = WSFE_URL[credentials.env];
  }

  async requestCae(invoice: ElectronicInvoiceRequest): Promise<ElectronicInvoiceResult> {
    const ticket = await this.wsaa.getTicket(WSFE_SERVICE);
    const cbteTipo = CBTE_TIPO[invoice.kind][invoice.documentLetter];
    const { docTipo, docNro } = resolveDocTipoNro(invoice.customerTaxId);
    const monId = resolveMonId(invoice.currencyCode);
    const cbteNro = Number.parseInt(invoice.number, 10);
    // Monotributo (C) never carries an IVA breakdown - there is no IVA on
    // these vouchers at all, discriminated or not.
    const ivaXml =
      invoice.documentLetter === 'C'
        ? ''
        : `<Iva>${invoice.taxLines
            .map(
              (line) =>
                `<AlicIva><Id>${resolveIvaId(line.rate)}</Id><BaseImp>${formatImporte(line.netAmount)}</BaseImp><Importe>${formatImporte(line.taxAmount)}</Importe></AlicIva>`,
            )
            .join('')}</Iva>`;

    const cbtesAsocXml = invoice.associatedVoucher
      ? `<CbtesAsoc><CbteAsoc><Tipo>${CBTE_TIPO.FACTURA[invoice.associatedVoucher.documentLetter]}</Tipo><PtoVta>${invoice.associatedVoucher.pointOfSale}</PtoVta><Nro>${Number.parseInt(invoice.associatedVoucher.number, 10)}</Nro></CbteAsoc></CbtesAsoc>`
      : '';

    // Percepciones/otros tributos (ej. IIBB) - vacío en la enorme mayoría
    // de comprobantes. AFIP exige el total en ImpTrib = Σ Tributo.Importe,
    // nunca 0.00 hardcodeado cuando hay filas (ver InvoicingService).
    const otherTaxes = invoice.otherTaxes ?? [];
    const impTrib = otherTaxes.reduce((sum, t) => sum + t.importe.toNumber(), 0);
    const tributosXml = otherTaxes.length
      ? `<Tributos>${otherTaxes
          .map(
            (t) =>
              `<Tributo><Id>${t.id}</Id><Desc>${escapeXml(t.desc)}</Desc><BaseImp>${formatImporte(t.baseImp)}</BaseImp><Alic>${t.alic.toFixed(2)}</Alic><Importe>${formatImporte(t.importe)}</Importe></Tributo>`,
          )
          .join('')}</Tributos>`
      : '';

    const concepto = CONCEPTO_ID[invoice.concept];
    // AFIP rejects FchServ*/FchVtoPago when present for Concepto 1, and
    // rejects their absence for 2/3 - never send them for Productos.
    const servicioXml =
      concepto === 1
        ? ''
        : `<ar:FchServDesde>${formatFecha(invoice.issueDate)}</ar:FchServDesde><ar:FchServHasta>${formatFecha(invoice.issueDate)}</ar:FchServHasta><ar:FchVtoPago>${formatFecha(invoice.dueDate ?? invoice.issueDate)}</ar:FchVtoPago>`;

    const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soapenv:Header/>
  <soapenv:Body>
    <ar:FECAESolicitar>
      <ar:Auth>
        <ar:Token>${ticket.token}</ar:Token>
        <ar:Sign>${ticket.sign}</ar:Sign>
        <ar:Cuit>${this.credentials.cuitRepresentada.replace(/\D/g, '')}</ar:Cuit>
      </ar:Auth>
      <ar:FeCAEReq>
        <ar:FeCabReq>
          <ar:CantReg>1</ar:CantReg>
          <ar:PtoVta>${invoice.pointOfSale}</ar:PtoVta>
          <ar:CbteTipo>${cbteTipo}</ar:CbteTipo>
        </ar:FeCabReq>
        <ar:FeDetReq>
          <ar:FECAEDetRequest>
            <ar:Concepto>${concepto}</ar:Concepto>
            <ar:DocTipo>${docTipo}</ar:DocTipo>
            <ar:DocNro>${docNro}</ar:DocNro>
            <ar:CbteDesde>${cbteNro}</ar:CbteDesde>
            <ar:CbteHasta>${cbteNro}</ar:CbteHasta>
            <ar:CbteFch>${formatFecha(invoice.issueDate)}</ar:CbteFch>
            <ar:ImpTotal>${formatImporte(invoice.total)}</ar:ImpTotal>
            <ar:ImpTotConc>${formatImporte(invoice.nonTaxedAmount)}</ar:ImpTotConc>
            <ar:ImpNeto>${formatImporte(invoice.netAmount)}</ar:ImpNeto>
            <ar:ImpOpEx>${formatImporte(invoice.exemptAmount)}</ar:ImpOpEx>
            <ar:ImpIVA>${formatImporte(invoice.taxAmount)}</ar:ImpIVA>
            <ar:ImpTrib>${impTrib.toFixed(2)}</ar:ImpTrib>
            <ar:MonId>${monId}</ar:MonId>
            <ar:MonCotiz>${invoice.exchangeRate.toFixed(6)}</ar:MonCotiz>
            ${servicioXml}
            ${cbtesAsocXml}
            ${tributosXml}
            ${ivaXml}
          </ar:FECAEDetRequest>
        </ar:FeDetReq>
      </ar:FeCAEReq>
    </ar:FECAESolicitar>
  </soapenv:Body>
</soapenv:Envelope>`;

    let responseText: string;
    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: 'http://ar.gov.afip.dif.FEV1/FECAESolicitar',
        },
        body: soapBody,
      });
      responseText = await response.text();
      if (!response.ok) {
        const faultMatch = responseText.match(/<faultstring>(.*?)<\/faultstring>/);
        throw new Error(
          faultMatch
            ? `AFIP WSFE rechazó la solicitud: ${faultMatch[1]}`
            : `AFIP WSFE respondió ${response.status}: ${responseText.slice(0, 500)}`,
        );
      }
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.startsWith('AFIP WSFE respondió') || err.message.startsWith('AFIP WSFE rechazó'))
      )
        throw err;
      throw new Error(`No se pudo conectar con AFIP WSFE: ${(err as Error).message}`);
    }

    const faultMatch = responseText.match(/<faultstring>(.*?)<\/faultstring>/);
    if (faultMatch) {
      throw new Error(`AFIP WSFE rechazó la solicitud: ${faultMatch[1]}`);
    }

    const parsed = xmlParser.parse(responseText);
    const result = parsed?.Envelope?.Body?.FECAESolicitarResponse?.FECAESolicitarResult;
    const detalle = result?.FeDetResp?.FECAEDetResponse;
    const errores = this.toArray(result?.Errors?.Err ?? detalle?.Observaciones?.Obs);

    if (detalle?.Resultado !== 'A' || !detalle?.CAE) {
      const errorText = (errores as WsfeError[])
        .map((e) => `[${e.Code}] ${e.Msg}`)
        .join('; ');
      throw new Error(
        `AFIP WSFE no autorizó el comprobante${errorText ? `: ${errorText}` : ' (sin detalle)'}`,
      );
    }

    return {
      cae: String(detalle.CAE),
      caeExpiry: this.parseCaeExpiry(String(detalle.CAEFchVto)),
    };
  }

  private toArray<T>(value: T | T[] | undefined): T[] {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  }

  /** AFIP returns CAEFchVto as "AAAAMMDD", not ISO. */
  private parseCaeExpiry(yyyymmdd: string): Date {
    const year = Number(yyyymmdd.slice(0, 4));
    const month = Number(yyyymmdd.slice(4, 6));
    const day = Number(yyyymmdd.slice(6, 8));
    return new Date(Date.UTC(year, month - 1, day));
  }
}
