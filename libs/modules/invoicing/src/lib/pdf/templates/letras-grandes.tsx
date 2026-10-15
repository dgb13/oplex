import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { FONTS } from '../fonts.js';
import { AUTHORIZED_LEGEND, type InvoicePdfData } from '../pdf-data.js';
import {
  documentTitle,
  footerLabel,
  type InvoicePageSize,
  joinDefined,
  Legends,
  PageFooter,
  TransparencyBox,
  A5_SCALE,
  sheetsBySize,
} from './parts.js';

// Letra de alta legibilidad y mucho contraste, para leer en el celular o
// con dificultad de visión. Sin lineHeight en la hoja (bug del pie fijo).
const SHEETS = sheetsBySize(StyleSheet.create({
  page: { paddingTop: 32, paddingBottom: 140, fontFamily: FONTS.legible, fontSize: 12, color: '#000000' },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderBottomWidth: 3, borderBottomColor: '#000000', paddingBottom: 10 },
  emitterName: { fontSize: 17, fontWeight: 700 },
  small: { fontSize: 10, lineHeight: 1.4 },
  letter: { width: 62, borderWidth: 2.5, borderColor: '#000000', alignItems: 'center' },
  letterText: { fontSize: 32, fontWeight: 700, lineHeight: 1.1 },
  letterCode: { fontSize: 8, fontWeight: 700, paddingBottom: 2 },
  docBox: { flex: 1, alignItems: 'flex-end' },
  docTitle: { fontSize: 19, fontWeight: 700 },
  two: { flexDirection: 'row', gap: 14, marginTop: 10 },
  lab: { fontWeight: 700 },
  line: { marginBottom: 2.5 },
  assoc: { marginTop: 9, backgroundColor: '#000000', color: '#ffffff', paddingVertical: 6, paddingHorizontal: 10, fontWeight: 700, fontSize: 12.5 },
  item: { flexDirection: 'row', gap: 14, paddingVertical: 7, borderBottomWidth: 1.2, borderBottomColor: '#000000' },
  itemName: { fontWeight: 700, fontSize: 13.5 },
  itemDetail: { fontSize: 11 },
  amount: { fontWeight: 700, fontSize: 14, alignSelf: 'center' },
  totw: { marginTop: 10, alignItems: 'flex-end', gap: 2 },
  grand: { marginTop: 5, borderWidth: 2.5, borderColor: '#000000', paddingVertical: 6, paddingHorizontal: 12, fontSize: 19, fontWeight: 700 },
  fiscal: { position: 'absolute', bottom: 38, flexDirection: 'row', alignItems: 'center', gap: 14, borderTopWidth: 2.5, borderTopColor: '#000000', paddingTop: 9 },
  qr: { width: 78, height: 78 },
  footer: { bottom: 16, fontSize: 9.5 },
}));

export function LetrasGrandesTemplate({ data, size }: { data: InvoicePdfData; size: InvoicePageSize }) {
  const s = SHEETS[size];
  const k = size === 'A5' ? A5_SCALE : 1;
  const { emitter, customer } = data;
  const discriminated = data.vatMode === 'DISCRIMINATED';
  const side = Math.round(40 * k);

  return (
    <Document title={documentTitle(data)} author={emitter.name}>
      <Page size={size} style={[s.page, { paddingHorizontal: side }]}>
        <View style={s.header}>
          <View style={{ flex: 1.3 }}>
            <Text style={s.emitterName}>{emitter.name}</Text>
            <Text style={s.small}>
              {joinDefined(
                [
                  emitter.taxId ? `CUIT ${emitter.taxId}` : null,
                  emitter.taxConditionLabel,
                  joinDefined([
                    emitter.grossIncomeNumber ? `IIBB ${emitter.grossIncomeNumber}` : null,
                    emitter.activityStart ? `Inicio ${emitter.activityStart}` : null,
                  ]),
                  emitter.address,
                  emitter.phone ? `Tel. ${emitter.phone}` : null,
                ],
                '\n',
              )}
            </Text>
          </View>
          <View style={s.letter}>
            <Text style={s.letterText}>{data.documentLetter}</Text>
            <Text style={s.letterCode}>COD. {data.cbteTipoCode}</Text>
          </View>
          <View style={s.docBox}>
            <Text style={s.docTitle}>{data.title}</Text>
            <Text style={{ fontSize: 13 * k }}>N° {data.fullNumber}</Text>
            <Text style={{ fontSize: 13 * k }}>{data.issueDate}</Text>
          </View>
        </View>

        <View style={s.two}>
          <View style={{ flex: 1 }}>
            <Text style={s.line}>
              <Text style={s.lab}>Cliente: </Text>
              {customer.name}
            </Text>
            {customer.docLabel ? (
              <Text style={s.line}>
                <Text style={s.lab}>{customer.docLabel}: </Text>
                {customer.docNumber}
              </Text>
            ) : null}
            <Text style={s.line}>
              <Text style={s.lab}>IVA: </Text>
              {customer.taxConditionLabel}
            </Text>
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
                <Text style={s.lab}>Período: </Text>
                {data.servicePeriod.from} al {data.servicePeriod.to}
                {`\n`}
                <Text style={s.lab}>Vto. de pago: </Text>
                {data.servicePeriod.paymentDue}
              </Text>
            ) : null}
            <Text style={s.line}>
              <Text style={s.lab}>Moneda: </Text>
              {data.isBaseCurrency ? 'Pesos' : `${data.currencyCode} (cotización ${data.exchangeRate})`}
            </Text>
          </View>
        </View>

        {data.associatedDocument ? (
          <Text style={s.assoc}>
            Corresponde a la {data.associatedDocument}.{data.reason ? ` Motivo: ${data.reason}` : ''}
          </Text>
        ) : null}

        <View style={{ marginTop: 8 }}>
          {data.lines.map((line, i) => (
            <View key={i} style={s.item} wrap={false}>
              <View style={{ flex: 1 }}>
                <Text style={s.itemName}>{line.description}</Text>
                <Text style={s.itemDetail}>
                  {`${line.quantity} ${line.unit} × $ ${line.unitPrice}`}
                  {line.discount ? ` · descuento ${line.discount}` : ''}
                  {discriminated ? ` · más IVA ${line.vatLabel}` : ''}
                </Text>
              </View>
              <Text style={s.amount}>$ {line.lineTotal}</Text>
            </View>
          ))}
        </View>

        <View wrap={false}>
          <View style={s.totw}>
            {data.totalRows.map((row) => (
              <Text key={row.label}>
                {row.label}: $ {row.amount}
              </Text>
            ))}
            <Text style={s.grand}>
              TOTAL: {data.isBaseCurrency ? '$' : data.currencyCode} {data.total}
            </Text>
          </View>
          <Text style={{ marginTop: 8 * k, fontSize: 11 * k }}>Son {data.totalInWords}.</Text>
          {data.bank?.alias ? (
            <Text style={{ marginTop: 6 * k, fontSize: 12 * k }}>
              <Text style={s.lab}>Para pagar por transferencia: </Text>
              alias {data.bank.alias}
              {data.bank.name ? ` (${data.bank.name})` : ''}
            </Text>
          ) : null}
          {data.notes ? <Text style={{ marginTop: 6 * k, fontSize: 11 * k, lineHeight: 1.4 }}>{data.notes}</Text> : null}
          <TransparencyBox data={data} size={size} style={{ marginTop: 8 * k, borderStyle: 'solid', borderColor: '#000000', borderWidth: 1.2 }} fontSize={10.5} />
          <Legends data={data} size={size} style={{ marginTop: 6 * k }} />
        </View>

        <View style={[s.fiscal, { left: side, right: side }]} fixed>
          <Image style={s.qr} src={data.qrDataUri} />
          <View style={{ gap: 2 * k }}>
            <Text style={[s.lab, { fontSize: 11.5 * k }]}>{AUTHORIZED_LEGEND}</Text>
            <Text style={{ fontSize: 11.5 * k }}>CAE {data.cae}</Text>
            <Text style={{ fontSize: 11.5 * k }}>Vence {data.caeExpiry}</Text>
          </View>
        </View>
        <PageFooter style={{ ...s.footer, left: side, right: side }} left={footerLabel(data)} />
      </Page>
    </Document>
  );
}
