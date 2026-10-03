import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { FONTS } from '../fonts.js';
import { NOT_AN_INVOICE_LEGEND, type QuotePdfData } from '../pdf-data.js';
import { customerTaxLine, fiscalLine, joinDefined, Logo, PageFooter, vatNotice } from './parts.js';

const INK = '#1a1a1a';
const MUTED = '#4a4a4a';

// Sin lineHeight en la hoja: ahí hace desaparecer el pie fijo (bug de
// @react-pdf/renderer). Va sólo en los textos de varios renglones.
const s = StyleSheet.create({
  page: { paddingTop: 44, paddingHorizontal: 54, paddingBottom: 60, fontFamily: FONTS.serif, fontSize: 9.6, color: INK },
  letterhead: { alignItems: 'center' },
  emitterName: { fontSize: 16, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 6, textAlign: 'center' },
  tradeName: { fontStyle: 'italic', color: MUTED },
  small: { fontSize: 8, color: MUTED, textAlign: 'center', marginTop: 2, lineHeight: 1.4 },
  rule: { borderTopWidth: 1.6, borderTopColor: INK, borderBottomWidth: 0.5, borderBottomColor: INK, height: 3.5, marginTop: 12, marginBottom: 10 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  docTitle: { fontSize: 13, fontWeight: 700, letterSpacing: 2.4, textTransform: 'uppercase' },
  xBox: { borderWidth: 0.8, borderColor: INK, paddingVertical: 2, paddingHorizontal: 7, alignItems: 'center' },
  xLetter: { fontSize: 14, fontWeight: 700 },
  xLegend: { fontSize: 7 },
  addr: { flexDirection: 'row', gap: 12, marginTop: 10 },
  lab: { fontWeight: 700 },
  intro: { marginTop: 12, marginBottom: 7, fontStyle: 'italic' },
  table: { borderWidth: 0.8, borderColor: INK },
  th: { flexDirection: 'row', backgroundColor: '#f3f1ec', borderBottomWidth: 0.8, borderBottomColor: INK },
  thText: { fontWeight: 700, fontSize: 8.6, paddingVertical: 4, paddingHorizontal: 5 },
  tr: { flexDirection: 'row', borderTopWidth: 0.4, borderTopColor: '#c9c6bf' },
  td: { paddingVertical: 4, paddingHorizontal: 5 },
  vline: { borderLeftWidth: 0.8, borderLeftColor: INK },
  cQty: { width: 50, textAlign: 'center' },
  cDesc: { flex: 1 },
  cPrice: { width: 84, textAlign: 'right' },
  cVat: { width: 40, textAlign: 'right' },
  cAmount: { width: 88, textAlign: 'right' },
  sub: { fontSize: 7.6, color: MUTED },
  totalsWrap: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
  totals: { width: 240 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1 },
  grand: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.8,
    borderTopColor: INK,
    borderBottomWidth: 2.4,
    borderBottomColor: INK,
    paddingVertical: 3,
    marginTop: 3,
  },
  grandText: { fontSize: 11.5, fontWeight: 700 },
  son: { marginTop: 9, borderWidth: 0.8, borderColor: INK, paddingVertical: 5, paddingHorizontal: 9 },
  conds: { marginTop: 10, gap: 2 },
  condsText: { fontSize: 9.6, lineHeight: 1.45 },
  sigs: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 40 },
  sig: { width: 190, borderTopWidth: 0.8, borderTopColor: INK, paddingTop: 3, textAlign: 'center', fontSize: 8.4 },
  footer: { bottom: 26, left: 54, right: 54, fontSize: 7.4, color: MUTED },
});

function Labeled({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <Text>
      <Text style={s.lab}>{label}: </Text>
      {value}
    </Text>
  );
}

export function TradicionalTemplate({ data }: { data: QuotePdfData }) {
  const { emitter, customer, conditions, totals } = data;
  const discriminated = data.vatMode === 'DISCRIMINATED';
  const city = emitter.address?.split(',')[1]?.trim();
  const notice = vatNotice(data);
  const commercial = [
    conditions.payment ? ['Forma de pago', conditions.payment] : null,
    conditions.delivery ? ['Plazo de entrega', conditions.delivery] : null,
    conditions.place ? ['Lugar de entrega', conditions.place] : null,
    conditions.warranty ? ['Garantía', conditions.warranty] : null,
  ].filter((item): item is string[] => item !== null);

  return (
    <Document title={`Presupuesto ${data.number}`} author={emitter.name}>
      <Page size="A4" style={s.page}>
        <View style={s.letterhead}>
          <Logo emitter={emitter} size={40} radius={20} background={INK} fontFamily={FONTS.serif} />
          <Text style={s.emitterName}>{emitter.name}</Text>
          {emitter.tradeName ? <Text style={s.tradeName}>{emitter.tradeName}</Text> : null}
          <Text style={s.small}>
            {joinDefined([emitter.address, emitter.phone ? `Tel. ${emitter.phone}` : null, emitter.email, emitter.website])}
          </Text>
          <Text style={s.small}>{fiscalLine(emitter)}</Text>
        </View>
        <View style={s.rule} />

        <View style={s.titleRow}>
          <View>
            <Text style={s.docTitle}>Presupuesto</Text>
            <Text>{joinDefined([`N° ${data.number}`, city ? `${city}, ${data.issueDate}` : data.issueDate])}</Text>
          </View>
          <View style={s.xBox}>
            <Text style={s.xLetter}>X</Text>
            <Text style={s.xLegend}>{NOT_AN_INVOICE_LEGEND}</Text>
          </View>
        </View>

        <View style={s.addr}>
          <View style={{ flex: 1 }}>
            <Labeled label="Señores" value={customer.name} />
            <Labeled label="CUIT" value={customerTaxLine(data) || null} />
            <Labeled label="Domicilio" value={customer.address} />
          </View>
          <View style={{ flex: 1 }}>
            <Labeled label="At." value={customer.contactName} />
            <Labeled
              label="Validez de la oferta"
              value={data.validUntil ? `${data.validDays ? `${data.validDays} días ` : ''}(hasta el ${data.validUntil})` : null}
            />
            <Labeled label="Vendedor" value={data.sellerName} />
          </View>
        </View>

        <Text style={s.intro}>De nuestra consideración: tenemos el agrado de cotizarles lo siguiente.</Text>

        <View style={s.table}>
          <View style={s.th}>
            <Text style={[s.thText, s.cQty]}>Cant.</Text>
            <Text style={[s.thText, s.cDesc, s.vline]}>Descripción</Text>
            <Text style={[s.thText, s.cPrice, s.vline]}>Precio unit.</Text>
            {discriminated ? <Text style={[s.thText, s.cVat, s.vline]}>IVA</Text> : null}
            <Text style={[s.thText, s.cAmount, s.vline]}>Importe</Text>
          </View>
          {data.lines.map((line, i) => (
            <View key={i} style={[s.tr, i === 0 ? { borderTopWidth: 0 } : {}]} wrap={false}>
              <View style={[s.td, s.cQty]}>
                <Text>{line.quantity}</Text>
                <Text style={s.sub}>{line.unit}</Text>
              </View>
              <View style={[s.td, s.cDesc, s.vline]}>
                <Text>
                  {line.articleName}
                  {line.variantLabel ? `, ${line.variantLabel}` : ''}
                </Text>
                <Text style={s.sub}>
                  {joinDefined([
                    `Cód. ${line.sku}`,
                    line.note,
                    line.discount ? `bonif. ${line.discount}` : null,
                  ], ' — ')}
                </Text>
              </View>
              <Text style={[s.td, s.cPrice, s.vline]}>{line.unitPrice}</Text>
              {discriminated ? <Text style={[s.td, s.cVat, s.vline]}>{line.vatLabel}</Text> : null}
              <Text style={[s.td, s.cAmount, s.vline]}>{line.amount}</Text>
            </View>
          ))}
        </View>

        <View wrap={false}>
          <View style={s.totalsWrap}>
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
              <View style={s.grand}>
                <Text style={s.grandText}>TOTAL $</Text>
                <Text style={s.grandText}>{totals.total}</Text>
              </View>
              {totals.vatContained ? (
                <View style={[s.totalRow, { marginTop: 2 }]}>
                  <Text style={s.sub}>IVA contenido</Text>
                  <Text style={s.sub}>{totals.vatContained}</Text>
                </View>
              ) : null}
            </View>
          </View>
          <View style={s.son}>
            <Text>
              <Text style={s.lab}>Son {totals.totalInWords}.</Text>
              {notice ? ` ${notice}` : ''}
            </Text>
          </View>
        </View>

        <View style={s.conds}>
          {commercial.length > 0 ? (
            <Text style={s.condsText}>
              {commercial.map(([label, value], i) => (
                <Text key={label}>
                  {i > 0 ? ' ' : ''}
                  <Text style={s.lab}>{label}:</Text> {value}.
                </Text>
              ))}
            </Text>
          ) : null}
          <Labeled label="Observaciones" value={data.notes} />
          <Labeled
            label="Datos bancarios"
            value={
              data.bank
                ? joinDefined([data.bank.name, data.bank.cbu ? `CBU ${data.bank.cbu}` : null, data.bank.alias ? `alias ${data.bank.alias}` : null], ', ')
                : null
            }
          />
        </View>

        <View wrap={false}>
          <Text style={{ marginTop: 10 }}>Sin otro particular, saludamos a ustedes muy atentamente.</Text>
          <View style={s.sigs}>
            <Text style={s.sig}>{joinDefined([data.sellerName, `por ${emitter.name}`], '\n')}</Text>
            <Text style={s.sig}>{'Conforme cliente\nFirma, aclaración y fecha'}</Text>
          </View>
        </View>

        <PageFooter style={s.footer} left={emitter.name} />
      </Page>
    </Document>
  );
}
