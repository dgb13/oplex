import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { FONTS } from '../fonts.js';
import { NOT_AN_INVOICE_LEGEND, type QuotePdfData } from '../pdf-data.js';
import { contactLine, customerTaxLine, fiscalLine, joinDefined, lineTitle, Logo, PageFooter, vatNotice } from './parts.js';

const INK = '#1d1e24';
const MUTED = '#6f737e';
const SOFT = '#f5f5fa';
const RULE = '#ececf2';

// Sin lineHeight en la hoja: ahí hace desaparecer el pie fijo (bug de
// @react-pdf/renderer). Va sólo en los textos de varios renglones.
const s = StyleSheet.create({
  page: { paddingTop: 40, paddingHorizontal: 44, paddingBottom: 64, fontFamily: FONTS.sans, fontSize: 9, color: INK },
  header: { flexDirection: 'row', justifyContent: 'space-between' },
  emitter: { flex: 1, flexDirection: 'row', gap: 12, marginRight: 24 },
  emitterName: { fontSize: 13, fontWeight: 700 },
  small: { fontSize: 8, color: MUTED, lineHeight: 1.45 },
  docBox: { width: 180, alignItems: 'flex-end' },
  docTitle: { fontSize: 21, fontWeight: 700, lineHeight: 1.15, marginBottom: 2 },
  docNumber: { fontFamily: FONTS.mono, fontSize: 10.5, fontWeight: 600 },
  bar: { flexDirection: 'row', height: 3, marginTop: 16, marginBottom: 14 },
  boxes: { flexDirection: 'row', gap: 10 },
  box: { backgroundColor: SOFT, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12 },
  boxTitle: { fontSize: 7, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 },
  kv: { flexDirection: 'row', marginTop: 1.5 },
  kvKey: { width: 52, color: MUTED },
  kvValue: { flex: 1 },
  table: { marginTop: 16 },
  th: { flexDirection: 'row', borderBottomWidth: 1.2, borderBottomColor: INK, paddingBottom: 5, paddingHorizontal: 4 },
  thText: { fontSize: 7, color: MUTED, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' },
  tr: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 4, borderBottomWidth: 0.6, borderBottomColor: RULE },
  cIdx: { width: 16, color: '#a2a6b0' },
  cDesc: { flex: 1, paddingRight: 8 },
  cQty: { width: 62, textAlign: 'right' },
  cPrice: { width: 70, textAlign: 'right' },
  cDisc: { width: 38, textAlign: 'right' },
  cVat: { width: 36, textAlign: 'right' },
  cAmount: { width: 74, textAlign: 'right' },
  sku: { fontFamily: FONTS.mono, fontSize: 7, color: MUTED, marginTop: 1 },
  note: { fontSize: 7.5, color: MUTED, marginTop: 1.5 },
  bold: { fontWeight: 600 },
  foot: { flexDirection: 'row', gap: 18, marginTop: 14 },
  totals: { width: 220, backgroundColor: SOFT, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1.5 },
  grand: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderTopWidth: 1.2,
    borderTopColor: INK,
    marginTop: 5,
    paddingTop: 6,
  },
  grandText: { fontSize: 13, fontWeight: 700 },
  words: { fontSize: 7.5, color: MUTED, marginTop: 5, lineHeight: 1.35 },
  obs: { marginTop: 10, borderLeftWidth: 2.5, paddingLeft: 8, paddingVertical: 2 },
  obsText: { fontSize: 9, lineHeight: 1.4 },
  accept: { flexDirection: 'row', gap: 18, marginTop: 34 },
  sig: { flex: 1, borderTopWidth: 0.8, borderTopColor: '#9a9ea8', paddingTop: 3, fontSize: 7, color: MUTED, textAlign: 'center' },
  footer: { bottom: 24, left: 44, right: 44, fontSize: 7, color: '#8b8f99', borderTopWidth: 0.6, borderTopColor: RULE, paddingTop: 6 },
});

function Kv({ k, v }: { k: string; v: string | null }) {
  if (!v) return null;
  return (
    <View style={s.kv}>
      <Text style={s.kvKey}>{k}</Text>
      <Text style={s.kvValue}>{v}</Text>
    </View>
  );
}

export function ModernoTemplate({ data }: { data: QuotePdfData }) {
  const { emitter, customer, conditions, totals } = data;
  const brand = emitter.brandColor;
  const discriminated = data.vatMode === 'DISCRIMINATED';
  const hasDiscount = data.lines.some((line) => line.discount);
  const hasConditions = Object.values(conditions).some(Boolean);
  const notice = vatNotice(data);

  return (
    <Document title={`Presupuesto ${data.number}`} author={emitter.name}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View style={s.emitter}>
            <Logo emitter={emitter} size={46} radius={10} fontFamily={FONTS.sans} />
            <View style={{ flex: 1 }}>
              <Text style={s.emitterName}>{emitter.tradeName ?? emitter.name}</Text>
              {emitter.tradeName ? <Text style={s.small}>{emitter.name}</Text> : null}
              <Text style={s.small}>{joinDefined([emitter.address, contactLine(emitter)], '\n')}</Text>
              <Text style={s.small}>{fiscalLine(emitter)}</Text>
            </View>
          </View>
          <View style={s.docBox}>
            <Text style={[s.docTitle, { color: brand }]}>Presupuesto</Text>
            <Text style={s.docNumber}>N° {data.number}</Text>
            <Text style={[s.small, { textAlign: 'right', marginTop: 3 }]}>
              {joinDefined(
                [
                  `Fecha ${data.issueDate}`,
                  data.validUntil ? `Válido hasta ${data.validUntil}${data.validDays ? ` (${data.validDays} días)` : ''}` : null,
                  data.sellerName ? `Vendedor: ${data.sellerName}` : null,
                ],
                '\n',
              )}
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
            <Text style={[s.bold, { fontSize: 10 }]}>{customer.name}</Text>
            <Kv k="CUIT" v={customerTaxLine(data) || null} />
            <Kv k="Domicilio" v={customer.address} />
            <Kv k="Contacto" v={joinDefined([customer.contactName, customer.contactEmail ?? customer.email, customer.contactPhone ?? customer.phone]) || null} />
          </View>
          <View style={[s.box, { flex: 1 }]}>
            <Text style={[s.boxTitle, { color: brand }]}>Condiciones</Text>
            <Kv k="Moneda" v={data.currencyCode} />
            <Kv k="Pago" v={conditions.payment} />
            <Kv k="Entrega" v={conditions.delivery} />
            <Kv k="Lugar" v={conditions.place} />
            {!hasConditions ? <Text style={[s.small, { marginTop: 2 }]}>A convenir.</Text> : null}
          </View>
        </View>

        <View style={s.table}>
          <View style={s.th}>
            <Text style={[s.thText, s.cIdx]}>#</Text>
            <Text style={[s.thText, s.cDesc]}>Descripción</Text>
            <Text style={[s.thText, s.cQty]}>Cant.</Text>
            <Text style={[s.thText, s.cPrice]}>P. unitario</Text>
            {hasDiscount ? <Text style={[s.thText, s.cDisc]}>Bonif.</Text> : null}
            {discriminated ? <Text style={[s.thText, s.cVat]}>IVA</Text> : null}
            <Text style={[s.thText, s.cAmount]}>Importe</Text>
          </View>
          {data.lines.map((line, i) => (
            <View key={i} style={[s.tr, i % 2 === 1 ? { backgroundColor: '#fafaff' } : {}]} wrap={false}>
              <Text style={s.cIdx}>{i + 1}</Text>
              <View style={s.cDesc}>
                <Text style={s.bold}>{lineTitle(line)}</Text>
                <Text style={s.sku}>{line.sku}</Text>
                {line.note ? <Text style={s.note}>{line.note}</Text> : null}
              </View>
              <Text style={s.cQty}>{`${line.quantity} ${line.unit}`}</Text>
              <Text style={s.cPrice}>{line.unitPrice}</Text>
              {hasDiscount ? <Text style={[s.cDisc, { color: line.discount ? '#15803d' : MUTED }]}>{line.discount ?? '-'}</Text> : null}
              {discriminated ? <Text style={s.cVat}>{line.vatLabel}</Text> : null}
              <Text style={[s.cAmount, s.bold]}>{line.amount}</Text>
            </View>
          ))}
        </View>

        <View style={s.foot} wrap={false}>
          <View style={{ flex: 1 }}>
            {data.bank ? (
              <View>
                <Text style={[s.boxTitle, { color: brand }]}>Pago por transferencia</Text>
                <Kv k="Banco" v={data.bank.name} />
                <View style={s.kv}>
                  <Text style={s.kvKey}>CBU</Text>
                  <Text style={[s.kvValue, { fontFamily: FONTS.mono }]}>{data.bank.cbu ?? '-'}</Text>
                </View>
                <View style={s.kv}>
                  <Text style={s.kvKey}>Alias</Text>
                  <Text style={[s.kvValue, { fontFamily: FONTS.mono }]}>{data.bank.alias ?? '-'}</Text>
                </View>
              </View>
            ) : null}
            <Kv k="Garantía" v={conditions.warranty} />
            {data.notes ? (
              <View style={[s.obs, { borderLeftColor: brand }]}>
                <Text style={s.obsText}>{data.notes}</Text>
              </View>
            ) : null}
          </View>
          <View style={s.totals}>
            <View style={s.totalRow}>
              <Text>Subtotal</Text>
              <Text>{totals.subtotal}</Text>
            </View>
            {totals.discount ? (
              <View style={s.totalRow}>
                <Text>Bonificaciones</Text>
                <Text>-{totals.discount}</Text>
              </View>
            ) : null}
            {discriminated && totals.netTaxed ? (
              <View style={s.totalRow}>
                <Text>Neto gravado</Text>
                <Text>{totals.netTaxed}</Text>
              </View>
            ) : null}
            {totals.netExempt ? (
              <View style={s.totalRow}>
                <Text>Exento / no gravado</Text>
                <Text>{totals.netExempt}</Text>
              </View>
            ) : null}
            {totals.vatByRate.map((row) => (
              <View key={row.label} style={s.totalRow}>
                <Text>{row.label}</Text>
                <Text>{row.amount}</Text>
              </View>
            ))}
            <View style={s.grand}>
              <Text style={[s.grandText, { color: brand }]}>Total {data.currencyCode}</Text>
              <Text style={[s.grandText, { color: brand }]}>$ {totals.total}</Text>
            </View>
            {totals.vatContained ? (
              <View style={[s.totalRow, { marginTop: 3 }]}>
                <Text style={s.small}>IVA contenido</Text>
                <Text style={s.small}>{totals.vatContained}</Text>
              </View>
            ) : null}
            <Text style={s.words}>{joinDefined([`Son ${totals.totalInWords}.`, notice], ' ')}</Text>
          </View>
        </View>

        <View style={s.accept} wrap={false}>
          <Text style={s.sig}>Firma del cliente</Text>
          <Text style={s.sig}>Aclaración</Text>
          <Text style={s.sig}>Fecha de aceptación</Text>
        </View>

        <PageFooter style={s.footer} left={NOT_AN_INVOICE_LEGEND} center={`${emitter.tradeName ?? emitter.name} · ${data.number}`} />
      </Page>
    </Document>
  );
}
