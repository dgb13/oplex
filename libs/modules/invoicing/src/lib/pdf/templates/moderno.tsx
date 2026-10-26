import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { FONTS } from '../fonts.js';
import { AUTHORIZED_LEGEND, type InvoicePdfData } from '../pdf-data.js';
import {
  contactLine,
  customerTaxLine,
  displayName,
  documentRows,
  documentTitle,
  emitterFiscalLines,
  footerLabel,
  type InvoicePageSize,
  joinDefined,
  Legends,
  Logo,
  PageFooter,
  priceHeader,
  TransparencyBox,
  A5_SCALE,
  sheetsBySize,
} from './parts.js';

const INK = '#1d1e24';
const MUTED = '#6f737e';
const SOFT = '#f5f5fa';
const RULE = '#ececf2';

// Sin lineHeight en la hoja: ahí hace desaparecer el pie fijo (bug de
// @react-pdf/renderer). Va sólo en los textos de varios renglones.
const SHEETS = sheetsBySize(StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 132, fontFamily: FONTS.sans, fontSize: 8.6, color: INK },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  emitter: { flex: 1, flexDirection: 'row', gap: 10 },
  emitterName: { fontSize: 12.5, fontWeight: 700 },
  small: { fontSize: 7.6, color: MUTED, lineHeight: 1.45 },
  letter: { width: 54, borderWidth: 1.6, borderRadius: 9, alignItems: 'center', paddingVertical: 3 },
  letterText: { fontSize: 26, fontWeight: 700, lineHeight: 1.1 },
  letterCode: { fontSize: 6.4, fontWeight: 600 },
  docBox: { flex: 1, alignItems: 'flex-end' },
  docTitle: { fontSize: 18, fontWeight: 700, lineHeight: 1.15 },
  docNumber: { fontFamily: FONTS.mono, fontSize: 10.5, fontWeight: 600, marginTop: 1 },
  bar: { flexDirection: 'row', height: 3, marginTop: 14, marginBottom: 12 },
  boxes: { flexDirection: 'row', gap: 10 },
  box: { backgroundColor: SOFT, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 11 },
  boxTitle: { fontSize: 6.8, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 },
  kv: { flexDirection: 'row', marginTop: 1.5 },
  kvKey: { width: 82, color: MUTED },
  kvValue: { flex: 1 },
  assoc: { marginTop: 8, backgroundColor: '#fff7ed', borderWidth: 0.7, borderColor: '#fed7aa', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, color: '#7c2d12' },
  table: { marginTop: 14 },
  th: { flexDirection: 'row', borderBottomWidth: 1.2, borderBottomColor: INK, paddingBottom: 5, paddingHorizontal: 4 },
  thText: { fontSize: 6.8, color: MUTED, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' },
  tr: { flexDirection: 'row', paddingVertical: 5.5, paddingHorizontal: 4, borderBottomWidth: 0.6, borderBottomColor: RULE },
  cIdx: { width: 16, color: '#a2a6b0' },
  cDesc: { flex: 1, paddingRight: 8 },
  cQty: { width: 58, textAlign: 'right' },
  cPrice: { width: 66, textAlign: 'right' },
  cDisc: { width: 40, textAlign: 'right' },
  cVat: { width: 36, textAlign: 'right' },
  cAmount: { width: 72, textAlign: 'right' },
  sku: { fontFamily: FONTS.mono, fontSize: 6.8, color: MUTED, marginTop: 1 },
  note: { fontSize: 7.5, color: MUTED, marginTop: 1.5 },
  bold: { fontWeight: 600 },
  foot: { flexDirection: 'row', gap: 18, marginTop: 12 },
  totals: { width: 210, backgroundColor: SOFT, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 11 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1.5 },
  grand: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderTopWidth: 1.2, borderTopColor: INK, marginTop: 5, paddingTop: 6 },
  grandText: { fontSize: 12.5, fontWeight: 700 },
  words: { fontSize: 8, fontWeight: 600, lineHeight: 1.35, marginBottom: 8 },
  obs: { marginTop: 8, borderLeftWidth: 2.5, paddingLeft: 8, paddingVertical: 2 },
  obsText: { fontSize: 8.4, lineHeight: 1.4 },
  fiscal: { position: 'absolute', bottom: 40, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 0.6, borderTopColor: RULE, paddingTop: 10 },
  qr: { width: 66, height: 66 },
  caeKey: { width: 70, color: MUTED },
  authorized: { marginLeft: 'auto', alignItems: 'flex-end' },
  footer: { bottom: 20, fontSize: 6.8, color: '#8b8f99' },
}));

function Kv({ s, k, v, mono }: { s: (typeof SHEETS)['A4']; k: string; v: string | null; mono?: boolean }) {
  if (!v) return null;
  return (
    <View style={s.kv}>
      <Text style={s.kvKey}>{k}</Text>
      <Text style={[s.kvValue, mono ? { fontFamily: FONTS.mono } : {}]}>{v}</Text>
    </View>
  );
}

export function ModernoTemplate({ data, size }: { data: InvoicePdfData; size: InvoicePageSize }) {
  const s = SHEETS[size];
  const k = size === 'A5' ? A5_SCALE : 1;
  const { emitter, customer } = data;
  const brand = emitter.brandColor;
  const discriminated = data.vatMode === 'DISCRIMINATED';
  const side = Math.round(42 * k);
  const conditions = documentRows(data).filter(([key]) => key !== 'Comp. asociado' && key !== 'Motivo');

  return (
    <Document title={documentTitle(data)} author={emitter.name}>
      <Page size={size} style={[s.page, { paddingHorizontal: side }]}>
        <View style={s.header}>
          <View style={s.emitter}>
            <Logo emitter={emitter} size={44 * k} radius={10} fontFamily={FONTS.sans} />
            <View style={{ flex: 1 }}>
              <Text style={s.emitterName}>{displayName(emitter)}</Text>
              {emitter.tradeName ? <Text style={s.small}>{emitter.name}</Text> : null}
              <Text style={s.small}>{emitterFiscalLines(emitter).join('\n')}</Text>
              {contactLine(emitter) ? <Text style={s.small}>{contactLine(emitter)}</Text> : null}
            </View>
          </View>
          <View style={[s.letter, { borderColor: brand }]}>
            <Text style={[s.letterText, { color: brand }]}>{data.documentLetter}</Text>
            <Text style={[s.letterCode, { color: brand }]}>COD. {data.cbteTipoCode}</Text>
          </View>
          <View style={s.docBox}>
            <Text style={[s.docTitle, { color: brand }]}>{data.title}</Text>
            <Text style={s.docNumber}>N° {data.fullNumber}</Text>
            <Text style={[s.small, { textAlign: 'right', marginTop: 3 }]}>
              {joinDefined([`Fecha de emisión ${data.issueDate}`, `Punto de venta ${data.pointOfSale}`, `Concepto: ${data.conceptLabel}`], '\n')}
            </Text>
          </View>
        </View>

        <View style={s.bar}>
          <View style={{ width: '18%', backgroundColor: brand }} />
          <View style={{ flex: 1, backgroundColor: brand, opacity: 0.15 }} />
        </View>

        <View style={s.boxes}>
          <View style={[s.box, { flex: 1.3 }]}>
            <Text style={[s.boxTitle, { color: brand }]}>Cliente</Text>
            <Text style={[s.bold, { fontSize: 9.6 * k }]}>{customer.name}</Text>
            <Text style={{ marginTop: 2 }}>{customerTaxLine(data)}</Text>
            {customer.address ? <Text style={{ marginTop: 1.5, color: MUTED }}>{customer.address}</Text> : null}
          </View>
          <View style={[s.box, { flex: 1 }]}>
            <Text style={[s.boxTitle, { color: brand }]}>Condiciones</Text>
            {conditions.map(([key, value]) => (
              <Kv key={key} s={s} k={key} v={value} />
            ))}
          </View>
        </View>

        {data.associatedDocument ? (
          <View style={s.assoc}>
            <Text>
              <Text style={s.bold}>Comprobante asociado: </Text>
              {data.associatedDocument}
              {data.reason ? (
                <>
                  <Text style={s.bold}> · Motivo: </Text>
                  {data.reason}
                </>
              ) : null}
            </Text>
          </View>
        ) : null}

        <View style={s.table}>
          <View style={s.th} fixed>
            <Text style={[s.thText, s.cIdx]}>#</Text>
            <Text style={[s.thText, s.cDesc]}>Descripción</Text>
            <Text style={[s.thText, s.cQty]}>Cant.</Text>
            <Text style={[s.thText, s.cPrice]}>{priceHeader(data)}</Text>
            {data.hasLineDiscounts ? <Text style={[s.thText, s.cDisc]}>Bonif.</Text> : null}
            {discriminated ? <Text style={[s.thText, s.cVat]}>IVA</Text> : null}
            <Text style={[s.thText, s.cAmount]}>Importe</Text>
          </View>
          {data.lines.map((line, i) => (
            <View key={i} style={[s.tr, i % 2 === 1 ? { backgroundColor: '#fafaff' } : {}]} wrap={false}>
              <Text style={s.cIdx}>{i + 1}</Text>
              <View style={s.cDesc}>
                <Text style={s.bold}>{line.description}</Text>
                <Text style={s.sku}>{line.sku}</Text>
                {line.note ? <Text style={s.note}>{line.note}</Text> : null}
              </View>
              <Text style={s.cQty}>{`${line.quantity} ${line.unit}`}</Text>
              <Text style={s.cPrice}>{line.unitPrice}</Text>
              {data.hasLineDiscounts ? <Text style={[s.cDisc, { color: line.discount ? '#15803d' : MUTED }]}>{line.discount ?? '-'}</Text> : null}
              {discriminated ? <Text style={s.cVat}>{line.vatLabel}</Text> : null}
              <Text style={[s.cAmount, s.bold]}>{line.lineTotal}</Text>
            </View>
          ))}
        </View>

        <View style={s.foot} wrap={false}>
          <View style={{ flex: 1 }}>
            <Text style={s.words}>Son {data.totalInWords}.</Text>
            {data.bank ? (
              <View style={{ marginBottom: 6 }}>
                <Text style={[s.boxTitle, { color: brand }]}>Pago por transferencia</Text>
                <Kv s={s} k="Banco" v={data.bank.name} />
                <Kv s={s} k="CBU" v={data.bank.cbu} mono />
                <Kv s={s} k="Alias" v={data.bank.alias} mono />
              </View>
            ) : null}
            {data.notes ? (
              <View style={[s.obs, { borderLeftColor: brand }]}>
                <Text style={s.obsText}>{data.notes}</Text>
              </View>
            ) : null}
            <TransparencyBox data={data} size={size} style={{ marginTop: 8 * k }} />
            <Legends data={data} size={size} style={{ marginTop: 8 * k }} />
          </View>
          <View style={s.totals}>
            {data.totalRows.map((row) => (
              <View key={row.label} style={s.totalRow}>
                <Text>{row.label}</Text>
                <Text>{row.amount}</Text>
              </View>
            ))}
            {/* Sin filas arriba (factura C) no hace falta la línea que separa el total. */}
            <View style={data.totalRows.length > 0 ? s.grand : [s.grand, { borderTopWidth: 0, marginTop: 0, paddingTop: 0 }]}>
              <Text style={[s.grandText, { color: brand }]}>Total</Text>
              <Text style={[s.grandText, { color: brand }]}>
                {data.isBaseCurrency ? '$' : data.currencyCode} {data.total}
              </Text>
            </View>
          </View>
        </View>

        <View style={[s.fiscal, { left: side, right: side }]} fixed>
          <Image style={s.qr} src={data.qrDataUri} />
          <View>
            <View style={s.kv}>
              <Text style={s.caeKey}>CAE N°</Text>
              <Text style={{ fontFamily: FONTS.mono }}>{data.cae}</Text>
            </View>
            <View style={s.kv}>
              <Text style={s.caeKey}>Vto. del CAE</Text>
              <Text>{data.caeExpiry}</Text>
            </View>
          </View>
          <View style={s.authorized}>
            <Text style={{ fontSize: 9.6 * k, fontWeight: 700, color: '#15803d' }}>{AUTHORIZED_LEGEND}</Text>
            <Text style={[s.small, { textAlign: 'right' }]}>Se puede verificar escaneando el QR{'\n'}o en el sitio de ARCA</Text>
          </View>
        </View>
        <PageFooter style={{ ...s.footer, left: side, right: side }}left={footerLabel(data)} />
      </Page>
    </Document>
  );
}
