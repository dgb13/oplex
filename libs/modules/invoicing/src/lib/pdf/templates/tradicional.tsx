import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { FONTS } from '../fonts.js';
import { AUTHORIZED_LEGEND, type InvoicePdfData } from '../pdf-data.js';
import {
  contactLine,
  customerTaxLine,
  currencyLabel,
  documentTitle,
  emitterFiscalLines,
  type InvoicePageSize,
  Legends,
  Logo,
  PageFooter,
  priceHeader,
  TransparencyBox,
  A5_SCALE,
  sheetsBySize,
} from './parts.js';

const INK = '#1a1a1a';
const MUTED = '#555555';

// Membrete formal con serifa. Sin lineHeight en la hoja (bug del pie fijo).
const SHEETS = sheetsBySize(StyleSheet.create({
  page: { paddingTop: 38, paddingBottom: 128, fontFamily: FONTS.serif, fontSize: 9.2, color: INK },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  emitterName: { fontSize: 14, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 4 },
  tradeName: { fontStyle: 'italic', color: '#444444' },
  small: { fontSize: 8, color: '#333333', lineHeight: 1.5, marginTop: 2 },
  letter: { width: 56, borderWidth: 1, borderColor: INK, alignItems: 'center', paddingVertical: 3 },
  letterText: { fontSize: 26, fontWeight: 700, lineHeight: 1.1 },
  letterCode: { fontSize: 6.6 },
  docBox: { flex: 1, alignItems: 'flex-end' },
  docTitle: { fontSize: 13, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' },
  rule: { borderTopWidth: 2, borderTopColor: INK, borderBottomWidth: 0.5, borderBottomColor: INK, height: 4, marginTop: 12, marginBottom: 10 },
  addr: { flexDirection: 'row', gap: 12 },
  lab: { fontWeight: 700 },
  // Sin lineHeight: con textos anidados @react-pdf separa los renglones de más.
  line: { marginBottom: 2.5 },
  table: { marginTop: 12, borderWidth: 0.8, borderColor: INK },
  th: { flexDirection: 'row', backgroundColor: '#f3f1ec', borderBottomWidth: 0.8, borderBottomColor: INK },
  thText: { fontWeight: 700, fontSize: 8.6, paddingVertical: 4, paddingHorizontal: 5 },
  tr: { flexDirection: 'row', borderTopWidth: 0.4, borderTopColor: '#c9c6bf' },
  td: { paddingVertical: 4, paddingHorizontal: 5 },
  vline: { borderLeftWidth: 0.8, borderLeftColor: INK },
  cQty: { width: 52, textAlign: 'center' },
  cDesc: { flex: 1 },
  cPrice: { width: 84, textAlign: 'right' },
  cVat: { width: 42, textAlign: 'right' },
  cAmount: { width: 90, textAlign: 'right' },
  sku: { fontSize: 7.6, color: MUTED },
  totw: { flexDirection: 'row', gap: 18, marginTop: 10 },
  totals: { width: 220 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1.2 },
  grand: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.8, borderTopColor: INK, borderBottomWidth: 2.4, borderBottomColor: INK, paddingVertical: 3, marginTop: 3 },
  grandText: { fontSize: 11.5, fontWeight: 700 },
  son: { marginTop: 10, borderWidth: 0.8, borderColor: INK, paddingVertical: 5, paddingHorizontal: 8, fontWeight: 700 },
  fiscal: { position: 'absolute', bottom: 40, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1.6, borderTopColor: INK, paddingTop: 9 },
  qr: { width: 64, height: 64 },
  footer: { bottom: 20, fontSize: 7.2, color: MUTED },
}));

export function TradicionalTemplate({ data, size }: { data: InvoicePdfData; size: InvoicePageSize }) {
  const s = SHEETS[size];
  const k = size === 'A5' ? A5_SCALE : 1;
  const { emitter, customer } = data;
  const discriminated = data.vatMode === 'DISCRIMINATED';
  const side = Math.round(50 * k);
  const city = emitter.address?.split(',')[1]?.trim();

  return (
    <Document title={documentTitle(data)} author={emitter.name}>
      <Page size={size} style={[s.page, { paddingHorizontal: side }]}>
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Logo emitter={emitter} size={36 * k} radius={18 * k} background={emitter.logo ? undefined : INK} fontFamily={FONTS.serif} />
            <Text style={s.emitterName}>{emitter.name}</Text>
            {emitter.tradeName ? <Text style={s.tradeName}>{emitter.tradeName}</Text> : null}
            <Text style={s.small}>{[...emitterFiscalLines(emitter), contactLine(emitter)].filter(Boolean).join('\n')}</Text>
          </View>
          <View style={s.letter}>
            <Text style={s.letterText}>{data.documentLetter}</Text>
            <Text style={s.letterCode}>Cód. {data.cbteTipoCode}</Text>
          </View>
          <View style={s.docBox}>
            <Text style={s.docTitle}>{data.title}</Text>
            <Text style={{ fontSize: 11 * k, marginTop: 2 }}>N° {data.fullNumber}</Text>
            <Text style={{ marginTop: 5 }}>{city ? `${city}, ${data.issueDate}` : data.issueDate}</Text>
            <Text style={s.small}>Concepto: {data.conceptLabel}</Text>
          </View>
        </View>

        <View style={s.rule} />

        <View style={s.addr}>
          <View style={{ flex: 1 }}>
            <Text style={s.line}>
              <Text style={s.lab}>Señor/es: </Text>
              {customer.name}
            </Text>
            {customerTaxLine(data) ? <Text style={s.line}>{customerTaxLine(data)}</Text> : null}
            {customer.address ? (
              <Text style={s.line}>
                <Text style={s.lab}>Domicilio: </Text>
                {customer.address}
              </Text>
            ) : null}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.line}>
              <Text style={s.lab}>Condición de venta: </Text>
              {data.saleCondition}
            </Text>
            {data.servicePeriod ? (
              <Text style={s.line}>
                <Text style={s.lab}>Período facturado: </Text>
                {data.servicePeriod.from} al {data.servicePeriod.to} · vto. de pago {data.servicePeriod.paymentDue}
              </Text>
            ) : null}
            <Text style={s.line}>
              <Text style={s.lab}>Moneda: </Text>
              {currencyLabel(data)}
            </Text>
            {data.associatedDocument ? (
              <Text style={s.line}>
                <Text style={s.lab}>Comprobante asociado: </Text>
                {data.associatedDocument}
              </Text>
            ) : null}
            {data.reason ? (
              <Text style={s.line}>
                <Text style={s.lab}>Motivo: </Text>
                {data.reason}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={s.table}>
          <View style={s.th} fixed>
            <Text style={[s.thText, s.cQty]}>Cant.</Text>
            <Text style={[s.thText, s.vline, s.cDesc]}>Descripción</Text>
            <Text style={[s.thText, s.vline, s.cPrice]}>{priceHeader(data)}</Text>
            {discriminated ? <Text style={[s.thText, s.vline, s.cVat]}>IVA</Text> : null}
            <Text style={[s.thText, s.vline, s.cAmount]}>Importe</Text>
          </View>
          {data.lines.map((line, i) => (
            <View key={i} style={i === 0 ? [s.tr, { borderTopWidth: 0 }] : s.tr} wrap={false}>
              <View style={[s.td, s.cQty]}>
                <Text>{line.quantity}</Text>
                <Text style={s.sku}>{line.unit}</Text>
              </View>
              <View style={[s.td, s.vline, s.cDesc]}>
                <Text>{line.description}</Text>
                {line.note ? <Text style={s.sku}>{line.note}</Text> : null}
                <Text style={s.sku}>
                  Cód. {line.sku}
                  {line.discount ? ` — bonif. ${line.discount}` : ''}
                </Text>
              </View>
              <Text style={[s.td, s.vline, s.cPrice]}>{line.unitPrice}</Text>
              {discriminated ? <Text style={[s.td, s.vline, s.cVat]}>{line.vatLabel}</Text> : null}
              <Text style={[s.td, s.vline, s.cAmount]}>{line.lineTotal}</Text>
            </View>
          ))}
        </View>

        <View wrap={false}>
          <View style={s.totw}>
            <View style={{ flex: 1 }}>
              <TransparencyBox data={data} size={size} style={{ borderStyle: 'solid', borderColor: INK }} />
              {data.notes ? (
                <Text style={[s.line, { marginTop: 6 }]}>
                  <Text style={s.lab}>Observaciones: </Text>
                  {data.notes}
                </Text>
              ) : null}
              {data.bank ? (
                <Text style={[s.line, { marginTop: 6 }]}>
                  <Text style={s.lab}>Datos bancarios: </Text>
                  {[data.bank.name, data.bank.cbu ? `CBU ${data.bank.cbu}` : null, data.bank.alias ? `alias ${data.bank.alias}` : null]
                    .filter(Boolean)
                    .join(', ')}
                  .
                </Text>
              ) : null}
            </View>
            <View style={s.totals}>
              {data.totalRows.map((row) => (
                <View key={row.label} style={s.totalRow}>
                  <Text>{row.label}</Text>
                  <Text>{row.amount}</Text>
                </View>
              ))}
              <View style={s.grand}>
                <Text style={s.grandText}>TOTAL {data.isBaseCurrency ? '$' : data.currencyCode}</Text>
                <Text style={s.grandText}>{data.total}</Text>
              </View>
            </View>
          </View>
          <Text style={s.son}>Son {data.totalInWords}.</Text>
          <Legends data={data} size={size} style={{ marginTop: 6 * k }} />
        </View>

        <View style={[s.fiscal, { left: side, right: side }]} fixed>
          <Image style={s.qr} src={data.qrDataUri} />
          <View style={{ gap: 3 * k }}>
            <Text style={s.lab}>{AUTHORIZED_LEGEND}</Text>
            <Text>CAE N° {data.cae}</Text>
            <Text>Fecha de vencimiento del CAE: {data.caeExpiry}</Text>
          </View>
        </View>
        <PageFooter style={{ ...s.footer, left: side, right: side }} left={emitter.name} />
      </Page>
    </Document>
  );
}
