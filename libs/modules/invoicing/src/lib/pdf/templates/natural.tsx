import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { FONTS } from '../fonts.js';
import { AUTHORIZED_LEGEND, type InvoicePdfData } from '../pdf-data.js';
import {
  contactLine,
  displayName,
  documentTitle,
  emitterFiscalLines,
  footerLabel,
  type InvoicePageSize,
  joinDefined,
  Legends,
  Logo,
  PageFooter,
  TransparencyBox,
  A5_SCALE,
  sheetsBySize,
} from './parts.js';

const BROWN = '#5b3a1a';
const TEXT = '#3d3328';
const MUTED = '#8a7a68';
const SAND = '#f1e6d4';
const PAPER = '#fbf7f0';
const THUMB_COLORS = ['#8a5a2b', '#6b7280', '#a16207', '#78716c', '#0f766e', '#7c3aed'];

// Sin lineHeight en la hoja: ahí hace desaparecer el pie fijo (bug de
// @react-pdf/renderer). Va sólo en los textos de varios renglones.
const SHEETS = sheetsBySize(StyleSheet.create({
  page: { paddingTop: 34, paddingBottom: 126, fontFamily: FONTS.rounded, fontSize: 9, color: TEXT, backgroundColor: PAPER },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emitter: { flex: 1, flexDirection: 'row', gap: 10, alignItems: 'center' },
  emitterName: { fontFamily: FONTS.display, fontSize: 16, fontWeight: 600, color: BROWN },
  small: { fontSize: 7.8, color: MUTED },
  letter: { width: 50, backgroundColor: BROWN, borderRadius: 12, alignItems: 'center', paddingTop: 3, paddingBottom: 5, color: PAPER },
  letterText: { fontFamily: FONTS.display, fontSize: 24, fontWeight: 600, lineHeight: 1.1 },
  letterCode: { fontSize: 6.4 },
  docBox: { flex: 1, alignItems: 'flex-end' },
  docTitle: { fontFamily: FONTS.display, fontSize: 18, fontWeight: 500, color: '#8a5a2b' },
  fiscalLine: { fontSize: 7.6, color: MUTED, marginTop: 10, lineHeight: 1.4 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 9 },
  pill: { backgroundColor: SAND, borderRadius: 10, paddingVertical: 3, paddingHorizontal: 9, fontSize: 8 },
  strong: { fontWeight: 700, color: BROWN },
  assoc: { marginTop: 9, backgroundColor: '#f6dcc8', borderRadius: 10, paddingVertical: 6, paddingHorizontal: 11, color: '#7a3416' },
  items: { marginTop: 12, gap: 5 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#ffffff', borderRadius: 10, paddingVertical: 6, paddingLeft: 6, paddingRight: 11 },
  thumb: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  thumbText: { color: '#ffffff', fontWeight: 700, fontSize: 9 },
  itemName: { fontWeight: 700 },
  itemSub: { fontSize: 7.6, color: MUTED },
  amount: { fontWeight: 700, fontSize: 10.2, color: BROWN, textAlign: 'right' },
  foot: { flexDirection: 'row', gap: 14, marginTop: 12 },
  note: { flex: 1, backgroundColor: SAND, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, color: '#5b4a38', gap: 5 },
  noteText: { fontSize: 8.8, lineHeight: 1.4 },
  noteTitle: { fontFamily: FONTS.display, fontWeight: 600, fontSize: 10.5, color: BROWN },
  totals: { width: 200, backgroundColor: BROWN, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 13, color: PAPER, alignSelf: 'flex-start' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1, color: '#ecdcc6' },
  grand: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 5, paddingTop: 6, borderTopWidth: 0.6, borderTopColor: '#8a6a4a' },
  grandText: { fontFamily: FONTS.display, fontSize: 15, fontWeight: 600 },
  fiscal: { position: 'absolute', bottom: 38, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#ffffff', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 11 },
  qr: { width: 60, height: 60 },
  footer: { bottom: 18, fontSize: 7, color: '#a8977f' },
}));

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((word) => /^[A-ZÁÉÍÓÚÑ]/.test(word))
    .slice(0, 2)
    .map((word) => word[0])
    .join('');
}

export function NaturalTemplate({ data, size }: { data: InvoicePdfData; size: InvoicePageSize }) {
  const s = SHEETS[size];
  const k = size === 'A5' ? A5_SCALE : 1;
  const { emitter, customer } = data;
  const discriminated = data.vatMode === 'DISCRIMINATED';
  const side = Math.round(40 * k);
  const firstName = customer.docLabel ? null : customer.name.split(/\s+/)[0];
  const pills: [string, string][] = [
    ['Para', customer.name],
    ...(customer.docLabel && customer.docNumber ? [[customer.docLabel, customer.docNumber] as [string, string]] : []),
    ...(customer.taxConditionLabel !== customer.name ? [['IVA', customer.taxConditionLabel] as [string, string]] : []),
    ...(customer.address ? [['Domicilio', customer.address] as [string, string]] : []),
    ['Venta', data.saleCondition],
    ...(data.servicePeriod
      ? [['Período', `${data.servicePeriod.from} al ${data.servicePeriod.to} · vto. ${data.servicePeriod.paymentDue}`] as [string, string]]
      : []),
    ...(!data.isBaseCurrency ? [['Moneda', `${data.currencyCode} (cotización ${data.exchangeRate})`] as [string, string]] : []),
  ];
  const isCreditNote = data.kind === 'NOTA_CREDITO';

  return (
    <Document title={documentTitle(data)} author={emitter.name}>
      <Page size={size} style={[s.page, { paddingHorizontal: side }]}>
        <View style={s.header}>
          <View style={s.emitter}>
            <Logo emitter={emitter} size={42 * k} radius={21 * k} background={emitter.logo ? undefined : '#8a5a2b'} fontFamily={FONTS.display} />
            <View style={{ flex: 1 }}>
              <Text style={s.emitterName}>{displayName(emitter)}</Text>
              {contactLine(emitter) ? <Text style={s.small}>{contactLine(emitter)}</Text> : null}
            </View>
          </View>
          <View style={s.letter}>
            <Text style={s.letterText}>{data.documentLetter}</Text>
            <Text style={s.letterCode}>Cód. {data.cbteTipoCode}</Text>
          </View>
          <View style={s.docBox}>
            <Text style={s.docTitle}>{data.title}</Text>
            <Text style={s.small}>
              N° {data.fullNumber} · {data.issueDate}
            </Text>
          </View>
        </View>

        <Text style={s.fiscalLine}>{joinDefined([emitter.name, ...emitterFiscalLines(emitter)])}</Text>

        <View style={s.pills}>
          {pills.map(([label, value]) => (
            <Text key={label} style={s.pill}>
              {label} <Text style={s.strong}>{value}</Text>
            </Text>
          ))}
        </View>

        {data.associatedDocument ? (
          <View style={s.assoc}>
            <Text>
              <Text style={{ fontWeight: 700 }}>Comprobante asociado: </Text>
              {data.associatedDocument}
              {data.reason ? ` · Motivo: ${data.reason}` : ''}
            </Text>
          </View>
        ) : null}

        <View style={s.items}>
          {data.lines.map((line, i) => (
            <View key={i} style={s.item} wrap={false}>
              {line.image ? (
                <Image src={line.image} style={[s.thumb, { objectFit: 'cover' }]} />
              ) : (
                <View style={[s.thumb, { backgroundColor: THUMB_COLORS[i % THUMB_COLORS.length] }]}>
                  <Text style={s.thumbText}>{initials(line.description) || '·'}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={s.itemName}>{line.description}</Text>
                {line.note ? <Text style={s.itemSub}>{line.note}</Text> : null}
                <Text style={s.itemSub}>
                  {line.sku}
                  {line.discount ? <Text style={{ color: '#3f7d3a', fontWeight: 700 }}>{` · ${line.discount} de descuento`}</Text> : null}
                </Text>
                <Text style={s.itemSub}>
                  {`${line.quantity} ${line.unit} × $ ${line.unitPrice}`}
                  {discriminated ? ` + IVA ${line.vatLabel}` : ''}
                </Text>
              </View>
              <Text style={s.amount}>$ {line.lineTotal}</Text>
            </View>
          ))}
        </View>

        <View style={s.foot} wrap={false}>
          <View style={s.note}>
            <Text style={s.noteTitle}>{isCreditNote ? 'Sobre esta nota de crédito' : firstName ? `Gracias por tu compra, ${firstName}` : 'Gracias por tu compra'}</Text>
            <Text style={s.noteText}>Son {data.totalInWords}.</Text>
            {data.notes ? <Text style={s.noteText}>{data.notes}</Text> : null}
            {data.bank ? (
              <Text style={s.noteText}>
                <Text style={{ fontWeight: 700 }}>Transferencia: </Text>
                {[data.bank.alias ? `alias ${data.bank.alias}` : null, data.bank.name, data.bank.cbu ? `CBU ${data.bank.cbu}` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            ) : null}
            <TransparencyBox data={data} size={size} style={{ borderColor: '#b39b7d' }} />
            <Legends data={data} size={size} />
          </View>
          <View style={s.totals}>
            {data.totalRows.map((row) => (
              <View key={row.label} style={s.totalRow}>
                <Text>{row.label}</Text>
                <Text>$ {row.amount}</Text>
              </View>
            ))}
            {/* Sin filas arriba (factura C) no hace falta la línea que separa el total. */}
            <View style={data.totalRows.length > 0 ? s.grand : [s.grand, { borderTopWidth: 0, marginTop: 0, paddingTop: 0 }]}>
              <Text style={s.grandText}>Total</Text>
              <Text style={s.grandText}>
                {data.isBaseCurrency ? '$' : data.currencyCode} {data.total}
              </Text>
            </View>
          </View>
        </View>

        <View style={[s.fiscal, { left: side, right: side }]} fixed>
          <Image style={s.qr} src={data.qrDataUri} />
          <View style={{ gap: 3 * k }}>
            <Text style={{ fontWeight: 700, color: BROWN }}>{AUTHORIZED_LEGEND}</Text>
            <Text>
              CAE N° {data.cae} · Vence {data.caeExpiry}
            </Text>
          </View>
        </View>
        <PageFooter style={{ ...s.footer, left: side, right: side }} left={footerLabel(data)} />
      </Page>
    </Document>
  );
}
