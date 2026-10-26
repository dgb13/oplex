import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { FONTS } from '../fonts.js';
import { AUTHORIZED_LEGEND, TRANSPARENCY_TITLE, type InvoicePdfData } from '../pdf-data.js';
import { contactLine, customerTaxLine, displayName, documentTitle, joinDefined, Logo } from './parts.js';

// 80mm de ancho (impresora térmica/de tickets común) en puntos PDF
// (1mm ≈ 2.83465pt). Un solo diseño: los 5 estilos son para A4/A5. En PDF
// no hay "alto infinito": el alto se estima según el contenido. Si la
// estimación se queda corta, react-pdf pagina a una segunda hoja del mismo
// ancho, no rompe nada.
const TICKET_WIDTH_PT = 227;
const ROW = 9;
// Caracteres de Geist Mono 7,2pt que entran en un renglón de 80mm.
const CHARS_PER_ROW = 46;

function ticketHeight(data: InvoicePdfData): number {
  const rowsFor = (text: string | null) => (text ? Math.ceil(text.length / CHARS_PER_ROW) : 0);
  const issuerRows = 6 + (data.emitter.tradeName ? 1 : 0) + rowsFor(data.emitter.address);
  const customerRows = 2 + (data.associatedDocument ? 2 : 0) + (data.servicePeriod ? 2 : 0);
  // Una línea larga ocupa dos renglones de descripción.
  const lineRows = data.lines.reduce(
    (sum, line) => sum + rowsFor(line.description) + (line.note ? rowsFor(line.note) : 0) + 1.3,
    0,
  );
  const totalsRows = data.totalRows.length + 2 + (data.transparency ? 4 : 0) + data.legends.length * 5;
  const footerRows = 3 + rowsFor(contactLine(data.emitter)) + rowsFor(data.notes);
  // Logo y nombre ~50pt, letra ~30pt, QR ~95pt, separadores (8) ~90pt, márgenes 24pt.
  return Math.ceil(290 + (issuerRows + customerRows + lineRows + totalsRows + footerRows) * ROW);
}

const s = StyleSheet.create({
  page: { paddingVertical: 12, paddingHorizontal: 10, fontSize: 7.2, fontFamily: FONTS.mono, color: '#111111' },
  center: { textAlign: 'center' },
  name: { fontFamily: FONTS.sans, fontWeight: 700, fontSize: 10, textAlign: 'center', marginTop: 3 },
  divider: { borderBottomWidth: 0.8, borderBottomColor: '#111111', borderStyle: 'dashed', marginVertical: 5 },
  letterRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
  letterBox: { width: 22, height: 22, borderWidth: 1.2, borderColor: '#111111', alignItems: 'center', justifyContent: 'center' },
  letterText: { fontFamily: FONTS.sans, fontWeight: 700, fontSize: 14 },
  bold: { fontWeight: 600 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  total: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2, fontSize: 10, fontWeight: 600 },
  qr: { width: 92, height: 92, alignSelf: 'center' },
});

export function TicketTemplate({ data }: { data: InvoicePdfData }) {
  const { emitter, customer } = data;
  const discriminated = data.vatMode === 'DISCRIMINATED';

  return (
    <Document title={documentTitle(data)} author={emitter.name}>
      <Page size={[TICKET_WIDTH_PT, ticketHeight(data)]} style={s.page}>
        <View style={{ alignItems: 'center' }}>
          <Logo emitter={emitter} size={30} radius={6} background={emitter.logo ? undefined : '#111111'} fontFamily={FONTS.sans} />
        </View>
        <Text style={s.name}>{displayName(emitter)}</Text>
        <Text style={s.center}>
          {joinDefined(
            [
              emitter.tradeName ? emitter.name : null,
              emitter.address,
              emitter.taxId ? `CUIT ${emitter.taxId}` : null,
              emitter.taxConditionLabel,
              emitter.grossIncomeNumber ? `IIBB ${emitter.grossIncomeNumber}` : null,
              emitter.activityStart ? `Inicio act. ${emitter.activityStart}` : null,
            ],
            '\n',
          )}
        </Text>

        <View style={s.divider} />
        <View style={s.letterRow}>
          <View style={s.letterBox}>
            <Text style={s.letterText}>{data.documentLetter}</Text>
          </View>
          <View>
            <Text style={s.bold}>{data.title.toUpperCase()}</Text>
            <Text>
              Cód. {data.cbteTipoCode} · N° {data.fullNumber}
            </Text>
          </View>
        </View>
        <Text style={[s.center, { marginTop: 3 }]}>
          Fecha {data.issueDate} · {data.saleCondition}
        </Text>
        {data.servicePeriod ? (
          <Text style={s.center}>
            Período {data.servicePeriod.from} al {data.servicePeriod.to}
            {`\n`}Vto. de pago {data.servicePeriod.paymentDue}
          </Text>
        ) : null}

        <View style={s.divider} />
        <Text>{customer.name}</Text>
        {customerTaxLine(data) ? <Text>{customerTaxLine(data)}</Text> : null}
        {customer.address ? <Text>{customer.address}</Text> : null}
        {data.associatedDocument ? <Text>Asoc.: {data.associatedDocument}</Text> : null}
        {data.reason ? <Text>Motivo: {data.reason}</Text> : null}

        <View style={s.divider} />
        {data.lines.map((line, i) => (
          <View key={i} style={{ marginBottom: 2 }} wrap={false}>
            <Text>{line.description}</Text>
            {line.note ? <Text>{line.note}</Text> : null}
            <View style={s.row}>
              <Text>
                {`${line.quantity} x ${line.unitPrice}`}
                {line.discount ? ` -${line.discount}` : ''}
                {discriminated ? ` (${line.vatLabel})` : ''}
              </Text>
              <Text>{line.lineTotal}</Text>
            </View>
          </View>
        ))}

        <View style={s.divider} />
        {data.totalRows.map((row) => (
          <View key={row.label} style={s.row}>
            <Text>{row.label}</Text>
            <Text>{row.amount}</Text>
          </View>
        ))}
        <View style={s.total}>
          <Text>TOTAL</Text>
          <Text>
            {data.isBaseCurrency ? '$' : data.currencyCode} {data.total}
          </Text>
        </View>
        {!data.isBaseCurrency ? <Text>Cotización {data.exchangeRate}</Text> : null}

        {data.transparency ? (
          <View>
            <View style={s.divider} />
            <Text style={{ fontSize: 6.4 }}>{TRANSPARENCY_TITLE}</Text>
            <View style={s.row}>
              <Text>IVA contenido</Text>
              <Text>{data.transparency.vatContained}</Text>
            </View>
            <View style={s.row}>
              <Text>Otros imp. nac. indirectos</Text>
              <Text>{data.transparency.otherIndirectTaxes}</Text>
            </View>
          </View>
        ) : null}
        {data.legends.map((legend) => (
          <Text key={legend} style={{ fontSize: 6.2, marginTop: 4 }}>
            {legend}
          </Text>
        ))}
        {data.notes ? <Text style={{ marginTop: 4 }}>{data.notes}</Text> : null}

        <View style={s.divider} />
        <Image style={s.qr} src={data.qrDataUri} />
        <Text style={[s.center, { marginTop: 3 }]}>
          <Text style={s.bold}>{AUTHORIZED_LEGEND}</Text>
          {`\nCAE ${data.cae}\nVto. CAE ${data.caeExpiry}`}
        </Text>

        <View style={s.divider} />
        <Text style={s.center}>{joinDefined([contactLine(emitter), data.kind === 'FACTURA' ? '¡Gracias por su compra!' : null], '\n')}</Text>
      </Page>
    </Document>
  );
}
