import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { FONTS } from '../fonts.js';
import { NOT_AN_INVOICE_LEGEND, type QuotePdfData } from '../pdf-data.js';
import { joinDefined, PageFooter, vatNotice } from './parts.js';

// Sin lineHeight en la hoja: ahí hace desaparecer el pie fijo (bug de
// @react-pdf/renderer). Va sólo en los textos de varios renglones.
const s = StyleSheet.create({
  page: { paddingTop: 36, paddingHorizontal: 40, paddingBottom: 56, fontFamily: FONTS.legible, fontSize: 13, color: '#000000' },
  header: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 3.5, borderBottomColor: '#000000', paddingBottom: 10 },
  emitterName: { fontSize: 19, fontWeight: 700 },
  small: { fontSize: 11 },
  docTitle: { fontSize: 22, fontWeight: 700, textAlign: 'right' },
  docSub: { fontSize: 14, textAlign: 'right' },
  two: { flexDirection: 'row', gap: 14, marginTop: 12, fontSize: 12.5 },
  lab: { fontWeight: 700 },
  valid: { marginTop: 11, backgroundColor: '#000000', color: '#ffffff', paddingVertical: 7, paddingHorizontal: 11, fontSize: 14, fontWeight: 700 },
  item: { flexDirection: 'row', gap: 14, paddingVertical: 8, borderBottomWidth: 1.4, borderBottomColor: '#000000' },
  itemName: { fontSize: 14.5, fontWeight: 700 },
  itemDetail: { fontSize: 12 },
  amount: { fontSize: 15.5, fontWeight: 700, textAlign: 'right', alignSelf: 'center' },
  totals: { marginTop: 11, alignItems: 'flex-end', gap: 2 },
  grand: { marginTop: 6, borderWidth: 2.6, borderColor: '#000000', paddingVertical: 7, paddingHorizontal: 13, fontSize: 20, fontWeight: 700 },
  cond: { marginTop: 11, fontSize: 12 },
  footer: { bottom: 20, left: 40, right: 40, fontSize: 10 },
});

export function LetrasGrandesTemplate({ data }: { data: QuotePdfData }) {
  const { emitter, customer, conditions, totals } = data;
  const discriminated = data.vatMode === 'DISCRIMINATED';
  const notice = vatNotice(data);

  return (
    <Document title={`Presupuesto ${data.number}`} author={emitter.name}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.emitterName}>{emitter.tradeName ?? emitter.name}</Text>
            <Text style={s.small}>
              {joinDefined([emitter.taxId ? `CUIT ${emitter.taxId}` : null, emitter.taxConditionLabel])}
            </Text>
            <Text style={s.small}>{joinDefined([emitter.phone ? `Tel. ${emitter.phone}` : null, emitter.email])}</Text>
          </View>
          <View>
            <Text style={s.docTitle}>Presupuesto</Text>
            <Text style={s.docSub}>N° {data.number}</Text>
            <Text style={s.docSub}>{data.issueDate}</Text>
          </View>
        </View>

        <View style={s.two}>
          <View style={{ flex: 1 }}>
            <Text>
              <Text style={s.lab}>Cliente: </Text>
              {customer.name}
            </Text>
            {customer.taxId ? (
              <Text>
                <Text style={s.lab}>CUIT: </Text>
                {customer.taxId}
              </Text>
            ) : null}
            {customer.contactName ? (
              <Text>
                <Text style={s.lab}>Contacto: </Text>
                {customer.contactName}
              </Text>
            ) : null}
          </View>
          <View style={{ flex: 1 }}>
            {conditions.payment ? (
              <Text>
                <Text style={s.lab}>Pago: </Text>
                {conditions.payment}
              </Text>
            ) : null}
            {conditions.delivery ? (
              <Text>
                <Text style={s.lab}>Entrega: </Text>
                {conditions.delivery}
              </Text>
            ) : null}
          </View>
        </View>

        {data.validUntil ? <Text style={s.valid}>Este presupuesto vale hasta el {data.validUntil}</Text> : null}

        <View style={{ marginTop: 9 }}>
          {data.lines.map((line, i) => (
            <View key={i} style={s.item} wrap={false}>
              <View style={{ flex: 1 }}>
                <Text style={s.itemName}>{line.articleName}</Text>
                <Text style={s.itemDetail}>
                  {joinDefined([
                    `${line.quantity} ${line.unit} × $ ${line.unitPrice}`,
                    line.discount ? `descuento ${line.discount}` : null,
                    discriminated ? `más IVA ${line.vatLabel}` : null,
                    line.variantLabel,
                    line.note,
                  ])}
                </Text>
              </View>
              <Text style={s.amount}>$ {line.amount}</Text>
            </View>
          ))}
        </View>

        <View style={s.totals} wrap={false}>
          {totals.discount ? <Text>Descuentos: -$ {totals.discount}</Text> : null}
          {discriminated && totals.netTaxed ? <Text>Neto: $ {totals.netTaxed}</Text> : null}
          {discriminated && totals.vatTotal ? <Text>IVA: $ {totals.vatTotal}</Text> : null}
          <Text style={s.grand}>TOTAL: $ {totals.total}</Text>
          {totals.vatContained ? <Text style={{ fontSize: 11 }}>IVA contenido: $ {totals.vatContained}</Text> : null}
          {notice ? <Text style={{ fontSize: 11 }}>{notice}</Text> : null}
        </View>

        {data.bank?.alias ? (
          <Text style={s.cond}>
            <Text style={s.lab}>Para pagar por transferencia:</Text> alias {data.bank.alias}
            {data.bank.name ? ` (${data.bank.name})` : ''}
          </Text>
        ) : null}
        {data.notes ? <Text style={s.cond}>{data.notes}</Text> : null}

        <PageFooter style={s.footer} left={NOT_AN_INVOICE_LEGEND} />
      </Page>
    </Document>
  );
}
