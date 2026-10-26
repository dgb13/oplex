import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { FONTS } from '../fonts.js';
import { AUTHORIZED_LEGEND, type InvoicePdfData } from '../pdf-data.js';
import {
  contactLine,
  displayName,
  documentRows,
  documentTitle,
  footerLabel,
  type InvoicePageSize,
  Legends,
  Logo,
  PageFooter,
  priceHeader,
  TransparencyBox,
  A5_SCALE,
  sheetsBySize,
} from './parts.js';

const INK = '#141418';
const MUTED = '#6b6b75';

// La grilla clásica de un comprobante de ARCA: recuadros con la letra en el
// centro. Sin lineHeight en la hoja (bug del pie fijo de @react-pdf).
const SHEETS = sheetsBySize(StyleSheet.create({
  page: { paddingTop: 22, paddingBottom: 104, fontFamily: FONTS.sans, fontSize: 7.6, color: INK },
  original: { borderWidth: 0.8, borderBottomWidth: 0, borderColor: INK, textAlign: 'center', fontWeight: 700, letterSpacing: 2, fontSize: 7, paddingVertical: 2 },
  grid: { flexDirection: 'row', borderWidth: 0.8, borderColor: INK },
  cell: { paddingVertical: 6, paddingHorizontal: 8 },
  divider: { borderLeftWidth: 0.8, borderLeftColor: INK },
  letterCell: { width: 70, alignItems: 'center' },
  letterBox: { width: 40, height: 38, borderWidth: 1.2, borderTopWidth: 0, borderColor: INK, alignItems: 'center', justifyContent: 'center' },
  letterText: { fontSize: 24, fontWeight: 700 },
  letterCode: { fontSize: 6.4, fontWeight: 700, marginTop: 3 },
  emitterName: { fontSize: 9.5, fontWeight: 700 },
  docTitle: { fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase' },
  mono: { fontFamily: FONTS.mono },
  row2: { flexDirection: 'row', borderWidth: 0.8, borderTopWidth: 0, borderColor: INK },
  kv: { flexDirection: 'row', marginTop: 1 },
  kvKey: { width: 88, fontWeight: 600 },
  kvValue: { flex: 1 },
  table: { marginTop: 7, borderWidth: 0.8, borderColor: INK },
  th: { flexDirection: 'row', backgroundColor: INK, color: '#ffffff', paddingVertical: 3.5, paddingHorizontal: 4 },
  thText: { fontSize: 6.4, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase' },
  tr: { flexDirection: 'row', paddingVertical: 2.5, paddingHorizontal: 4, borderBottomWidth: 0.4, borderBottomColor: '#e3e3e8' },
  cCode: { width: 84, fontSize: 6.6 },
  cDesc: { flex: 1, paddingRight: 6 },
  cQty: { width: 38, textAlign: 'right' },
  cUnit: { width: 30, paddingLeft: 4 },
  cPrice: { width: 60, textAlign: 'right' },
  cDisc: { width: 34, textAlign: 'right' },
  cVat: { width: 34, textAlign: 'right' },
  cAmount: { width: 64, textAlign: 'right' },
  bottom: { flexDirection: 'row', gap: 8, marginTop: 7 },
  bx: { borderWidth: 0.8, borderColor: INK, paddingVertical: 5, paddingHorizontal: 7, marginBottom: 5 },
  bxTitle: { fontSize: 6.4, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 2 },
  totals: { width: 190, borderWidth: 0.8, borderColor: INK, alignSelf: 'flex-start' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1.5, paddingHorizontal: 7 },
  grand: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: INK, color: '#ffffff', paddingVertical: 4, paddingHorizontal: 7, marginTop: 2 },
  grandText: { fontSize: 9.6, fontWeight: 700 },
  fiscal: { position: 'absolute', bottom: 32, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 0.8, borderColor: INK, paddingVertical: 6, paddingHorizontal: 8 },
  qr: { width: 58, height: 58 },
  footer: { bottom: 14, fontSize: 6.4, color: MUTED },
}));

function Kv({ s, k, v, mono }: { s: (typeof SHEETS)['A4']; k: string; v: string | null; mono?: boolean }) {
  if (!v) return null;
  return (
    <View style={s.kv}>
      <Text style={s.kvKey}>{k}</Text>
      <Text style={[s.kvValue, mono ? s.mono : {}]}>{v}</Text>
    </View>
  );
}

export function CompactoTemplate({ data, size }: { data: InvoicePdfData; size: InvoicePageSize }) {
  const s = SHEETS[size];
  const k = size === 'A5' ? A5_SCALE : 1;
  const { emitter, customer } = data;
  const discriminated = data.vatMode === 'DISCRIMINATED';
  const side = Math.round(26 * k);

  return (
    <Document title={documentTitle(data)} author={emitter.name}>
      <Page size={size} style={[s.page, { paddingHorizontal: side }]}>
        <Text style={s.original}>ORIGINAL</Text>
        <View style={s.grid}>
          <View style={[s.cell, { flex: 1, flexDirection: 'row', gap: 7 }]}>
            <Logo emitter={emitter} size={30 * k} radius={5} background={emitter.logo ? undefined : INK} fontFamily={FONTS.sans} />
            <View style={{ flex: 1 }}>
              <Text style={s.emitterName}>{displayName(emitter)}</Text>
              {emitter.tradeName ? <Text>{emitter.name}</Text> : null}
              {emitter.address ? <Text>{emitter.address}</Text> : null}
              {contactLine(emitter) ? <Text>{contactLine(emitter)}</Text> : null}
              {emitter.taxConditionLabel ? <Text style={{ fontWeight: 700, marginTop: 1 }}>{emitter.taxConditionLabel}</Text> : null}
            </View>
          </View>
          <View style={[s.divider, s.letterCell]}>
            <View style={s.letterBox}>
              <Text style={s.letterText}>{data.documentLetter}</Text>
            </View>
            <Text style={s.letterCode}>COD. {data.cbteTipoCode}</Text>
          </View>
          <View style={[s.cell, s.divider, { flex: 1 }]}>
            <Text style={s.docTitle}>{data.title}</Text>
            <Kv s={s} k="Punto de venta" v={data.pointOfSale} mono />
            <Kv s={s} k="Comp. N°" v={data.number} mono />
            <Kv s={s} k="Fecha de emisión" v={data.issueDate} />
            <Kv s={s} k="CUIT" v={emitter.taxId} />
            <Kv s={s} k="Ingresos Brutos" v={emitter.grossIncomeNumber} />
            <Kv s={s} k="Inicio de actividades" v={emitter.activityStart} />
          </View>
        </View>

        <View style={s.row2}>
          <View style={[s.cell, { flex: 1 }]}>
            <Kv s={s} k={customer.docLabel ?? 'Documento'} v={customer.docNumber ?? '-'} />
            <Kv s={s} k="Razón social" v={customer.name} />
            <Kv s={s} k="Condición IVA" v={customer.taxConditionLabel} />
            <Kv s={s} k="Domicilio" v={customer.address} />
          </View>
          <View style={[s.cell, s.divider, { flex: 1 }]}>
            {documentRows(data).map(([key, value]) => (
              <Kv key={key} s={s} k={key} v={value} />
            ))}
          </View>
        </View>

        <View style={s.table}>
          <View style={s.th} fixed>
            <Text style={[s.thText, s.cCode]}>Código</Text>
            <Text style={[s.thText, s.cDesc]}>Producto / servicio</Text>
            <Text style={[s.thText, s.cQty]}>Cant.</Text>
            <Text style={[s.thText, s.cUnit]}>U.</Text>
            <Text style={[s.thText, s.cPrice]}>{priceHeader(data)}</Text>
            {data.hasLineDiscounts ? <Text style={[s.thText, s.cDisc]}>Bonif.</Text> : null}
            {discriminated ? <Text style={[s.thText, s.cVat]}>Alíc.</Text> : null}
            <Text style={[s.thText, s.cAmount]}>Subtotal</Text>
          </View>
          {data.lines.map((line, i) => (
            <View key={i} style={[s.tr, i % 2 === 1 ? { backgroundColor: '#f6f6f8' } : {}]} wrap={false}>
              <Text style={[s.cCode, s.mono]}>{line.sku}</Text>
              <Text style={s.cDesc}>
                {line.description}
                {line.note ? <Text style={{ color: MUTED }}> ({line.note})</Text> : null}
              </Text>
              <Text style={s.cQty}>{line.quantity}</Text>
              <Text style={s.cUnit}>{line.unit}</Text>
              <Text style={s.cPrice}>{line.unitPrice}</Text>
              {data.hasLineDiscounts ? <Text style={s.cDisc}>{line.discount ?? ''}</Text> : null}
              {discriminated ? <Text style={s.cVat}>{line.vatLabel}</Text> : null}
              <Text style={s.cAmount}>{line.lineTotal}</Text>
            </View>
          ))}
        </View>

        <View style={s.bottom} wrap={false}>
          <View style={{ flex: 1 }}>
            <View style={s.bx}>
              <Text style={s.bxTitle}>Son</Text>
              <Text>{data.totalInWords}</Text>
            </View>
            {data.notes ? (
              <View style={s.bx}>
                <Text style={s.bxTitle}>Observaciones</Text>
                <Text>{data.notes}</Text>
              </View>
            ) : null}
            {data.bank ? (
              <View style={s.bx}>
                <Text style={s.bxTitle}>Transferencia</Text>
                <Text>
                  {[data.bank.name, data.bank.cbu ? `CBU ${data.bank.cbu}` : null, data.bank.alias ? `Alias ${data.bank.alias}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
            ) : null}
            <TransparencyBox data={data} size={size} style={{ borderStyle: 'solid', borderColor: INK, marginBottom: 5 * k }} fontSize={7.2} />
            <Legends data={data} size={size} />
          </View>
          <View style={s.totals}>
            {data.totalRows.map((row) => (
              <View key={row.label} style={s.totalRow}>
                <Text>{row.label}</Text>
                <Text>{row.amount}</Text>
              </View>
            ))}
            <View style={s.grand}>
              <Text style={s.grandText}>IMPORTE TOTAL</Text>
              <Text style={s.grandText}>
                {data.isBaseCurrency ? '' : `${data.currencyCode} `}
                {data.total}
              </Text>
            </View>
          </View>
        </View>

        <View style={[s.fiscal, { left: side, right: side }]} fixed>
          <Image style={s.qr} src={data.qrDataUri} />
          <View>
            <Text style={{ fontSize: 9 * k, fontWeight: 700, marginBottom: 2 }}>{AUTHORIZED_LEGEND}</Text>
            <Kv s={s} k="CAE N°" v={data.cae} mono />
            <Kv s={s} k="Vto. del CAE" v={data.caeExpiry} />
          </View>
        </View>
        <PageFooter style={{ ...s.footer, left: side, right: side }} left={footerLabel(data)} />
      </Page>
    </Document>
  );
}
