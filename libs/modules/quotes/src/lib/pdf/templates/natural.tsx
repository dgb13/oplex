import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { FONTS } from '../fonts.js';
import { NOT_AN_INVOICE_LEGEND, type QuotePdfData } from '../pdf-data.js';
import { fiscalLine, joinDefined, Logo, PageFooter, vatNotice } from './parts.js';

const BROWN = '#5b3a1a';
const TEXT = '#3d3328';
const MUTED = '#8a7a68';
const SAND = '#f1e6d4';
const PAPER = '#fbf7f0';
const THUMB_COLORS = ['#8a5a2b', '#6b7280', '#a16207', '#78716c', '#0f766e', '#7c3aed'];

// Sin lineHeight en la hoja: ahí hace desaparecer el pie fijo (bug de
// @react-pdf/renderer). Va sólo en los textos de varios renglones.
const s = StyleSheet.create({
  page: { paddingTop: 38, paddingHorizontal: 42, paddingBottom: 56, fontFamily: FONTS.rounded, fontSize: 9.4, color: TEXT, backgroundColor: PAPER },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  emitter: { flexDirection: 'row', gap: 10, alignItems: 'center', maxWidth: 340 },
  emitterName: { fontFamily: FONTS.display, fontSize: 17, fontWeight: 600, color: BROWN },
  small: { fontSize: 8, color: MUTED },
  docTitle: { fontFamily: FONTS.display, fontSize: 19, fontWeight: 500, color: '#8a5a2b', textAlign: 'right' },
  hello: { fontFamily: FONTS.display, fontSize: 12.5, fontWeight: 600, color: BROWN, marginTop: 18 },
  intro: { fontSize: 9.4, color: '#6b5d4d', marginTop: 3, maxWidth: 440, lineHeight: 1.4 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  pill: { backgroundColor: SAND, borderRadius: 10, paddingVertical: 3, paddingHorizontal: 9, fontSize: 8.2 },
  pillStrong: { fontWeight: 700, color: BROWN },
  items: { marginTop: 13, gap: 6 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#ffffff', borderRadius: 10, paddingVertical: 7, paddingLeft: 7, paddingRight: 11 },
  thumb: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  thumbText: { color: '#ffffff', fontWeight: 700, fontSize: 9 },
  itemName: { fontWeight: 700 },
  itemSub: { fontSize: 7.8, color: MUTED },
  amount: { fontWeight: 700, fontSize: 10.5, color: BROWN, textAlign: 'right' },
  foot: { flexDirection: 'row', gap: 14, marginTop: 13 },
  note: { flex: 1, backgroundColor: SAND, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, color: '#5b4a38' },
  noteText: { fontSize: 9.4, lineHeight: 1.4 },
  noteTitle: { fontFamily: FONTS.display, fontWeight: 600, fontSize: 10.5, color: BROWN, marginBottom: 3 },
  totals: { width: 210, backgroundColor: BROWN, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 13, color: PAPER, alignSelf: 'flex-start' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1, color: '#ecdcc6' },
  grand: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 5, paddingTop: 6, borderTopWidth: 0.6, borderTopColor: '#8a6a4a' },
  grandText: { fontFamily: FONTS.display, fontSize: 16, fontWeight: 600 },
  pay: { marginTop: 9, backgroundColor: '#ffffff', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 12, fontSize: 8.2 },
  footer: { bottom: 22, left: 42, right: 42, fontSize: 7, color: '#a8977f' },
});

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((word) => /^[A-ZÁÉÍÓÚÑ]/.test(word))
    .slice(0, 2)
    .map((word) => word[0])
    .join('');
}

export function NaturalTemplate({ data }: { data: QuotePdfData }) {
  const { emitter, customer, conditions, totals } = data;
  const notice = vatNotice(data);
  const discriminated = data.vatMode === 'DISCRIMINATED';
  const greeting = customer.contactFirstName ? `Hola ${customer.contactFirstName}, gracias por consultarnos.` : 'Gracias por consultarnos.';
  const replyTo = emitter.email ?? emitter.phone;
  const pills = [
    data.validUntil ? ['Válido hasta', data.validUntil] : null,
    conditions.delivery ? ['Entrega', conditions.delivery] : null,
    conditions.payment ? ['Pago', conditions.payment] : null,
    data.sellerName ? ['Te atendió', data.sellerName] : null,
  ].filter((pill): pill is string[] => pill !== null);
  const toKeepInMind = joinDefined(
    [
      data.notes,
      conditions.warranty ? `Garantía: ${conditions.warranty}.` : null,
      conditions.place ? `Entrega: ${conditions.place}.` : null,
    ],
    ' ',
  );

  return (
    <Document title={`Presupuesto ${data.number}`} author={emitter.name}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View style={s.emitter}>
            <Logo emitter={emitter} size={44} radius={22} background="#8a5a2b" fontFamily={FONTS.display} />
            <View>
              <Text style={s.emitterName}>{emitter.tradeName ?? emitter.name}</Text>
              <Text style={s.small}>{joinDefined([emitter.tradeName ? emitter.name : null, emitter.website, emitter.phone])}</Text>
            </View>
          </View>
          <View>
            <Text style={s.docTitle}>Presupuesto</Text>
            <Text style={[s.small, { textAlign: 'right' }]}>{`N° ${data.number} · ${data.issueDate}`}</Text>
          </View>
        </View>

        <Text style={s.hello}>{greeting}</Text>
        <Text style={s.intro}>
          Te pasamos el presupuesto para <Text style={{ fontWeight: 700 }}>{customer.name}</Text>.
          {replyTo ? ` Si tenés dudas o querés ajustar algo, escribinos a ${replyTo}.` : ''}
        </Text>

        {pills.length > 0 ? (
          <View style={s.pills}>
            {pills.map(([label, value]) => (
              <Text key={label} style={s.pill}>
                {label} <Text style={s.pillStrong}>{value}</Text>
              </Text>
            ))}
          </View>
        ) : null}

        <View style={s.items}>
          {data.lines.map((line, i) => (
            <View key={i} style={s.item} wrap={false}>
              {line.image ? (
                <Image src={line.image} style={[s.thumb, { objectFit: 'cover' }]} />
              ) : (
                <View style={[s.thumb, { backgroundColor: THUMB_COLORS[i % THUMB_COLORS.length] }]}>
                  <Text style={s.thumbText}>{initials(line.articleName) || '·'}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={s.itemName}>{line.articleName}</Text>
                {line.variantLabel || line.note || line.discount ? (
                  <Text style={s.itemSub}>
                    {joinDefined([line.variantLabel, line.note])}
                    {line.discount ? (
                      <Text style={{ color: '#3f7d3a', fontWeight: 700 }}>
                        {line.variantLabel || line.note ? ' · ' : ''}
                        {line.discount} de descuento
                      </Text>
                    ) : null}
                  </Text>
                ) : null}
                <Text style={s.itemSub}>
                  {`${line.quantity} ${line.unit} × $ ${line.unitPrice}${discriminated ? ` + IVA ${line.vatLabel}` : ''}`}
                </Text>
              </View>
              <Text style={s.amount}>$ {line.amount}</Text>
            </View>
          ))}
        </View>

        <View wrap={false}>
          <View style={s.foot}>
            <View style={s.note}>
              <Text style={s.noteTitle}>Para tener en cuenta</Text>
              <Text style={s.noteText}>{toKeepInMind || 'Cualquier cambio que necesites, avisanos y lo ajustamos.'}</Text>
            </View>
            <View style={s.totals}>
              <View style={s.totalRow}>
                <Text>Subtotal</Text>
                <Text>$ {totals.subtotal}</Text>
              </View>
              {totals.discount ? (
                <View style={s.totalRow}>
                  <Text>Descuentos</Text>
                  <Text>-$ {totals.discount}</Text>
                </View>
              ) : null}
              {totals.vatByRate.map((row) => (
                <View key={row.label} style={s.totalRow}>
                  <Text>{row.label}</Text>
                  <Text>$ {row.amount}</Text>
                </View>
              ))}
              {totals.vatContained ? (
                <View style={s.totalRow}>
                  <Text>IVA contenido</Text>
                  <Text>$ {totals.vatContained}</Text>
                </View>
              ) : null}
              <View style={s.grand}>
                <Text style={s.grandText}>Total</Text>
                <Text style={s.grandText}>$ {totals.total}</Text>
              </View>
              {notice ? <Text style={{ fontSize: 7.4, color: '#ecdcc6', marginTop: 3 }}>{notice}</Text> : null}
            </View>
          </View>

          <View style={s.pay}>
            {data.bank ? (
              <>
                <Text>
                  <Text style={{ fontWeight: 700 }}>Transferencia:</Text> {data.bank.name ?? ''}
                </Text>
                {data.bank.alias ? (
                  <Text>
                    Alias <Text style={{ fontWeight: 700 }}>{data.bank.alias}</Text>
                  </Text>
                ) : null}
                {data.bank.cbu ? <Text>CBU {data.bank.cbu}</Text> : null}
              </>
            ) : null}
            <Text>{fiscalLine(emitter)}</Text>
          </View>
        </View>

        <PageFooter style={s.footer} left={NOT_AN_INVOICE_LEGEND} />
      </Page>
    </Document>
  );
}
