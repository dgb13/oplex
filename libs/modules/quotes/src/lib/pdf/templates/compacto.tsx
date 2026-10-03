import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { FONTS } from '../fonts.js';
import { NOT_AN_INVOICE_LEGEND, type QuotePdfData } from '../pdf-data.js';
import { contactLine, customerTaxLine, joinDefined, lineTitle, Logo, PageFooter, vatNotice } from './parts.js';

const INK = '#141418';
const MUTED = '#6b6b75';

// Sin lineHeight en la hoja: ahí hace desaparecer el pie fijo (bug de
// @react-pdf/renderer). Va sólo en los textos de varios renglones.
const s = StyleSheet.create({
  page: { paddingTop: 24, paddingHorizontal: 26, paddingBottom: 40, fontFamily: FONTS.sans, fontSize: 7.6, color: INK },
  grid: { flexDirection: 'row', borderWidth: 0.8, borderColor: INK },
  cell: { paddingVertical: 6, paddingHorizontal: 8 },
  divider: { borderLeftWidth: 0.8, borderLeftColor: INK },
  xCell: { width: 82, alignItems: 'center', justifyContent: 'center' },
  xBox: { width: 34, height: 34, borderWidth: 1.2, borderColor: INK, alignItems: 'center', justifyContent: 'center' },
  xLetter: { fontSize: 22, fontWeight: 700 },
  xLegend: { fontSize: 5.6, textAlign: 'center', marginTop: 3 },
  emitterName: { fontSize: 9.5, fontWeight: 700 },
  docTitle: { fontSize: 10.5, fontWeight: 700 },
  mono: { fontFamily: FONTS.mono },
  row2: { flexDirection: 'row', borderWidth: 0.8, borderTopWidth: 0, borderColor: INK },
  kv: { flexDirection: 'row', marginTop: 1 },
  kvKey: { width: 54, fontWeight: 600 },
  kvValue: { flex: 1 },
  table: { marginTop: 7, borderWidth: 0.8, borderColor: INK },
  th: { flexDirection: 'row', backgroundColor: INK, color: '#ffffff', paddingVertical: 3.5, paddingHorizontal: 4 },
  thText: { fontSize: 6.6, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase' },
  tr: { flexDirection: 'row', paddingVertical: 2.5, paddingHorizontal: 4, borderBottomWidth: 0.4, borderBottomColor: '#e3e3e8' },
  cCode: { width: 96, fontSize: 6.6 },
  cDesc: { flex: 1, paddingRight: 6 },
  cQty: { width: 40, textAlign: 'right' },
  cUnit: { width: 34, paddingLeft: 4 },
  cPrice: { width: 62, textAlign: 'right' },
  cDisc: { width: 30, textAlign: 'right' },
  cVat: { width: 30, textAlign: 'right' },
  cAmount: { width: 66, textAlign: 'right' },
  bottom: { flexDirection: 'row', gap: 8, marginTop: 7 },
  bx: { borderWidth: 0.8, borderColor: INK, paddingVertical: 5, paddingHorizontal: 7, marginBottom: 5 },
  bxTitle: { fontSize: 6.6, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 2 },
  totals: { width: 190, borderWidth: 0.8, borderColor: INK, alignSelf: 'flex-start' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1.5, paddingHorizontal: 7 },
  grand: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: INK, color: '#ffffff', paddingVertical: 4, paddingHorizontal: 7, marginTop: 2 },
  grandText: { fontSize: 10, fontWeight: 700 },
  footer: { bottom: 16, left: 26, right: 26, fontSize: 6.4, color: MUTED },
});

function Kv({ k, v, mono }: { k: string; v: string | null; mono?: boolean }) {
  if (!v) return null;
  return (
    <View style={s.kv}>
      <Text style={s.kvKey}>{k}</Text>
      <Text style={[s.kvValue, mono ? s.mono : {}]}>{v}</Text>
    </View>
  );
}

export function CompactoTemplate({ data }: { data: QuotePdfData }) {
  const { emitter, customer, conditions, totals } = data;
  const discriminated = data.vatMode === 'DISCRIMINATED';
  const hasDiscount = data.lines.some((line) => line.discount);
  const notice = vatNotice(data);
  const observations = joinDefined([data.notes, conditions.warranty ? `Garantía: ${conditions.warranty}.` : null], ' ');

  return (
    <Document title={`Presupuesto ${data.number}`} author={emitter.name}>
      <Page size="A4" style={s.page}>
        <View style={s.grid}>
          <View style={[s.cell, { flex: 1, flexDirection: 'row', gap: 7 }]}>
            <Logo emitter={emitter} size={30} radius={5} background={INK} fontFamily={FONTS.sans} />
            <View style={{ flex: 1 }}>
              <Text style={s.emitterName}>{emitter.name}</Text>
              {emitter.tradeName ? <Text>{emitter.tradeName}</Text> : null}
              {emitter.address ? <Text>{emitter.address}</Text> : null}
              <Text>{contactLine(emitter)}</Text>
            </View>
          </View>
          <View style={[s.cell, s.divider, s.xCell]}>
            <View style={s.xBox}>
              <Text style={s.xLetter}>X</Text>
            </View>
            <Text style={s.xLegend}>{NOT_AN_INVOICE_LEGEND.toUpperCase()}</Text>
          </View>
          <View style={[s.cell, s.divider, { flex: 1 }]}>
            <Text style={s.docTitle}>
              PRESUPUESTO <Text style={s.mono}>N° {data.number}</Text>
            </Text>
            <Kv k="Fecha" v={data.issueDate} />
            <Kv k="Válido hasta" v={data.validUntil} />
            <Kv k="CUIT" v={emitter.taxId} />
            <Kv k="Condición" v={emitter.taxConditionLabel} />
            <Kv k="IIBB · Inicio" v={joinDefined([emitter.grossIncomeNumber, emitter.activityStart]) || null} />
          </View>
        </View>

        <View style={s.row2}>
          <View style={[s.cell, { flex: 1 }]}>
            <View style={s.kv}>
              <Text style={s.kvKey}>Cliente</Text>
              <Text style={[s.kvValue, { fontWeight: 700 }]}>{customer.name}</Text>
            </View>
            <Kv k="CUIT" v={customerTaxLine(data) || null} />
            <Kv k="Domicilio" v={customer.address} />
            <Kv k="Contacto" v={joinDefined([customer.contactName, customer.contactEmail ?? customer.email]) || null} />
          </View>
          <View style={[s.cell, s.divider, { flex: 1 }]}>
            <Kv k="Pago" v={conditions.payment} />
            <Kv k="Entrega" v={joinDefined([conditions.delivery, conditions.place]) || null} />
            <Kv k="Vendedor" v={data.sellerName} />
            <Kv k="Moneda" v={data.currencyCode} />
          </View>
        </View>

        <View style={s.table}>
          <View style={s.th}>
            <Text style={[s.thText, s.cCode]}>Código</Text>
            <Text style={[s.thText, s.cDesc]}>Descripción</Text>
            <Text style={[s.thText, s.cQty]}>Cant.</Text>
            <Text style={[s.thText, s.cUnit]}>U.</Text>
            <Text style={[s.thText, s.cPrice]}>P. unit.</Text>
            {hasDiscount ? <Text style={[s.thText, s.cDisc]}>Bon.</Text> : null}
            {discriminated ? <Text style={[s.thText, s.cVat]}>IVA</Text> : null}
            <Text style={[s.thText, s.cAmount]}>Importe</Text>
          </View>
          {data.lines.map((line, i) => (
            <View key={i} style={[s.tr, i % 2 === 1 ? { backgroundColor: '#f6f6f8' } : {}]} wrap={false}>
              <Text style={[s.cCode, s.mono]}>{line.sku}</Text>
              <Text style={s.cDesc}>
                {lineTitle(line)}
                {line.note ? <Text style={{ color: MUTED }}> ({line.note})</Text> : null}
              </Text>
              <Text style={s.cQty}>{line.quantity}</Text>
              <Text style={s.cUnit}>{line.unit}</Text>
              <Text style={s.cPrice}>{line.unitPrice}</Text>
              {hasDiscount ? <Text style={s.cDisc}>{line.discount ?? ''}</Text> : null}
              {discriminated ? <Text style={s.cVat}>{line.vatLabel}</Text> : null}
              <Text style={s.cAmount}>{line.amount}</Text>
            </View>
          ))}
        </View>

        <View style={s.bottom} wrap={false}>
          <View style={{ flex: 1 }}>
            {observations ? (
              <View style={s.bx}>
                <Text style={s.bxTitle}>Observaciones</Text>
                <Text>{observations}</Text>
              </View>
            ) : null}
            {data.bank ? (
              <View style={s.bx}>
                <Text style={s.bxTitle}>Transferencia</Text>
                <Text>
                  {joinDefined([
                    data.bank.name,
                    data.bank.cbu ? `CBU ${data.bank.cbu}` : null,
                    data.bank.alias ? `Alias ${data.bank.alias}` : null,
                  ])}
                </Text>
              </View>
            ) : null}
            <View style={s.bx}>
              <Text style={s.bxTitle}>Son</Text>
              <Text>{joinDefined([`${totals.totalInWords}.`, notice], ' ')}</Text>
            </View>
          </View>
          <View style={s.totals}>
            <View style={[s.totalRow, { marginTop: 3 }]}>
              <Text>Subtotal</Text>
              <Text>{totals.subtotal}</Text>
            </View>
            {totals.discount ? (
              <View style={s.totalRow}>
                <Text>Bonificación</Text>
                <Text>-{totals.discount}</Text>
              </View>
            ) : null}
            {totals.netTaxed ? (
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
            {totals.vatContained ? (
              <View style={s.totalRow}>
                <Text>IVA contenido</Text>
                <Text>{totals.vatContained}</Text>
              </View>
            ) : null}
            <View style={s.grand}>
              <Text style={s.grandText}>TOTAL {data.currencyCode}</Text>
              <Text style={s.grandText}>{totals.total}</Text>
            </View>
          </View>
        </View>

        <PageFooter style={s.footer} left={joinDefined([data.number, emitter.name, emitter.website])} />
      </Page>
    </Document>
  );
}
