import { Image, Text, View } from '@react-pdf/renderer';
import type { Style } from '@react-pdf/types';
import { TRANSPARENCY_TITLE, type InvoicePdfData, type InvoicePdfEmitter } from '../pdf-data.js';

export type InvoicePageSize = 'A4' | 'A5';

/** A5 mide 0,71 de A4 de ancho: la misma plantilla con todas las medidas
 * achicadas en esa proporción, así entra igual que en A4 en media hoja. */
export const A5_SCALE = 0.72;

const SCALED_KEYS = /^(fontSize|width|height|gap|top|bottom|left|right|letterSpacing|borderRadius|(padding|margin)(Top|Bottom|Left|Right|Horizontal|Vertical)?|border(Top|Bottom|Left|Right)?Width)$/;

/** Copia de una hoja de estilos con las medidas multiplicadas por k
 * (los porcentajes, 'auto' y lineHeight no se tocan). */
export function scaleStyles<T extends Record<string, Style>>(styles: T, k: number): T {
  const scaled: Record<string, Style> = {};
  for (const [name, style] of Object.entries(styles)) {
    const copy: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(style)) {
      copy[key] = typeof value === 'number' && SCALED_KEYS.test(key) ? Math.round(value * k * 100) / 100 : value;
    }
    scaled[name] = copy as Style;
  }
  return scaled as T;
}

/** La hoja de estilos de cada tamaño, calculada una sola vez. */
export function sheetsBySize<T extends Record<string, Style>>(styles: T): Record<InvoicePageSize, T> {
  return { A4: styles, A5: scaleStyles(styles, A5_SCALE) };
}

/** Logo cargado en Preferencias o, si no hay, un recuadro con las iniciales. */
export function Logo({
  emitter,
  size,
  radius = 0,
  background,
  color = '#ffffff',
  fontFamily,
}: {
  emitter: InvoicePdfEmitter;
  size: number;
  radius?: number;
  background?: string;
  color?: string;
  fontFamily?: string;
}) {
  if (emitter.logo) {
    return <Image src={emitter.logo} style={{ width: size, height: size, objectFit: 'contain' }} />;
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: background ?? emitter.brandColor,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color, fontFamily, fontWeight: 700, fontSize: size * 0.36 }}>{emitter.initials}</Text>
    </View>
  );
}

export function joinDefined(parts: (string | null | undefined)[], separator = ' · '): string {
  return parts.filter((part) => part && part.trim()).join(separator);
}

/** Domicilio, CUIT, condición IVA, IIBB e inicio de actividades: lo que el
 * emisor tiene que mostrar sí o sí (RG 1415). */
export function emitterFiscalLines(emitter: InvoicePdfEmitter): string[] {
  return [
    emitter.address,
    joinDefined([emitter.taxId ? `CUIT ${emitter.taxId}` : null, emitter.taxConditionLabel]),
    joinDefined([
      emitter.grossIncomeNumber ? `Ingresos Brutos ${emitter.grossIncomeNumber}` : null,
      emitter.activityStart ? `Inicio de actividades ${emitter.activityStart}` : null,
    ]),
  ].filter((line): line is string => Boolean(line));
}

export function contactLine(emitter: InvoicePdfEmitter): string {
  return joinDefined([emitter.phone, emitter.email, emitter.website]);
}

export function displayName(emitter: InvoicePdfEmitter): string {
  return emitter.tradeName ?? emitter.name;
}

/** "CUIT 30-… · IVA Responsable Inscripto" o "Consumidor Final" (nada si
 * el cliente ya se llama así, para no repetirlo). */
export function customerTaxLine(data: InvoicePdfData): string {
  const { customer } = data;
  const condition = customer.taxConditionLabel.toLowerCase() === customer.name.trim().toLowerCase() ? null : customer.taxConditionLabel;
  return joinDefined([customer.docLabel ? `${customer.docLabel} ${customer.docNumber}` : null, condition]);
}

export function currencyLabel(data: InvoicePdfData): string {
  return data.isBaseCurrency ? data.currencyCode : `${data.currencyCode} (cotización ${data.exchangeRate})`;
}

/** Datos del comprobante que no son del emisor ni del cliente, en orden:
 * condición de venta, período facturado (servicios), moneda y, en las
 * notas de crédito, el comprobante asociado y el motivo. */
export function documentRows(data: InvoicePdfData): [string, string][] {
  const rows: [string, string][] = [['Condición de venta', data.saleCondition]];
  if (data.servicePeriod) {
    rows.push(['Período facturado', `${data.servicePeriod.from} al ${data.servicePeriod.to}`]);
    rows.push(['Vto. para el pago', data.servicePeriod.paymentDue]);
  }
  rows.push(['Moneda', currencyLabel(data)]);
  if (data.associatedDocument) rows.push(['Comp. asociado', data.associatedDocument]);
  if (data.reason) rows.push(['Motivo', data.reason]);
  return rows;
}

export function priceHeader(data: InvoicePdfData): string {
  return data.vatMode === 'DISCRIMINATED' ? 'P. unit. neto' : 'P. unitario';
}

/** RG 5614: abajo a la izquierda, con su título y los dos importes. */
export function TransparencyBox({ data, style, fontSize: baseFontSize = 7.5, size = 'A4' }: { data: InvoicePdfData; style?: Style; fontSize?: number; size?: InvoicePageSize }) {
  if (!data.transparency) return null;
  const fontSize = size === 'A5' ? Math.round(baseFontSize * A5_SCALE * 10) / 10 : baseFontSize;
  const row = { flexDirection: 'row' as const, justifyContent: 'space-between' as const, marginTop: 1.5 };
  return (
    <View style={[{ borderWidth: 0.7, borderStyle: 'dashed', borderColor: '#8a8e98', paddingVertical: 5, paddingHorizontal: 7 }, style ?? {}]} wrap={false}>
      <Text style={{ fontSize: fontSize - 0.5, fontWeight: 700 }}>{TRANSPARENCY_TITLE}</Text>
      <View style={row}>
        <Text style={{ fontSize }}>IVA contenido</Text>
        <Text style={{ fontSize }}>$ {data.transparency.vatContained}</Text>
      </View>
      <View style={row}>
        <Text style={{ fontSize }}>Otros impuestos nacionales indirectos</Text>
        <Text style={{ fontSize }}>$ {data.transparency.otherIndirectTaxes}</Text>
      </View>
    </View>
  );
}

/** Leyendas fiscales extra (Ley 27.618) en letra chica. */
export function Legends({ data, style, size = 'A4' }: { data: InvoicePdfData; style?: Style; size?: InvoicePageSize }) {
  if (data.legends.length === 0) return null;
  return (
    <View style={style}>
      {data.legends.map((legend) => (
        <Text key={legend} style={{ fontSize: size === 'A5' ? 5.6 : 7, lineHeight: 1.35 }}>
          {legend}
        </Text>
      ))}
    </View>
  );
}

/** Pie fijo en todas las hojas, con "Página X de Y". */
export function PageFooter({ style, left }: { style: Style; left: string }) {
  return (
    <View fixed style={[{ position: 'absolute', flexDirection: 'row', justifyContent: 'space-between' }, style]}>
      <Text>{left}</Text>
      <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
    </View>
  );
}

export function footerLabel(data: InvoicePdfData): string {
  return `${displayName(data.emitter)} · ${data.title} ${data.documentLetter} ${data.fullNumber}`;
}

export function documentTitle(data: InvoicePdfData): string {
  return `${data.title} ${data.documentLetter} ${data.fullNumber}`;
}
