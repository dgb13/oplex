import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { InvoicePdfData } from '../pdf-data.js';

// 80mm de ancho (impresora térmica/de tickets común) en puntos PDF
// (1mm ≈ 2.83465pt). En PDF no hay "alto infinito": el alto se estima según
// el contenido (antes era fijo en 850pt y un ticket de 1 línea salía con
// media hoja en blanco). Si la estimación se queda corta, react-pdf pagina
// a una segunda hoja del mismo ancho, no rompe nada.
const TICKET_WIDTH_PT = 227;

function ticketHeight(data: InvoicePdfData): number {
  const issuerRows = [
    data.issuerTaxId,
    data.issuerTaxConditionLabel,
    data.issuerFiscalAddress,
    data.issuerGrossIncomeNumber,
    data.issuerActivityStartDate,
  ].filter(Boolean).length;
  const totalsRows =
    [data.subtotalWithoutVat, data.netTaxed, data.netExempt, data.netUntaxed].filter(Boolean).length +
    data.taxBuckets.length;
  // Cabecera/divisores/título/cliente ~150pt, CAE + QR ~130pt, márgenes 20pt.
  return Math.max(320, 300 + issuerRows * 9 + data.lines.length * 20 + totalsRows * 9);
}

const styles = StyleSheet.create({
  page: { padding: 10, fontSize: 7, fontFamily: 'Courier', color: '#0f172a' },
  center: { textAlign: 'center' },
  bold: { fontFamily: 'Courier-Bold' },
  title: { fontFamily: 'Courier-Bold', fontSize: 9, textAlign: 'center', marginBottom: 2 },
  divider: { borderBottomWidth: 1, borderBottomColor: '#0f172a', borderStyle: 'dashed', marginVertical: 4 },
  line: { flexDirection: 'row', justifyContent: 'space-between' },
  lineDesc: { marginBottom: 1 },
  lineDetail: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  grandTotalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 },
  qrImage: { width: 90, height: 90, alignSelf: 'center', marginTop: 6 },
});

export function TicketTemplate({ data }: { data: InvoicePdfData }) {
  return (
    <Document>
      <Page size={[TICKET_WIDTH_PT, ticketHeight(data)]} style={styles.page}>
        <Text style={[styles.center, styles.bold]}>{data.issuerName}</Text>
        {data.issuerTaxId && <Text style={styles.center}>CUIT {data.issuerTaxId}</Text>}
        {data.issuerTaxConditionLabel && <Text style={styles.center}>{data.issuerTaxConditionLabel}</Text>}
        {data.issuerFiscalAddress && <Text style={styles.center}>{data.issuerFiscalAddress}</Text>}
        {data.issuerGrossIncomeNumber && <Text style={styles.center}>IIBB: {data.issuerGrossIncomeNumber}</Text>}
        {data.issuerActivityStartDate && (
          <Text style={styles.center}>Inicio de actividades: {data.issuerActivityStartDate}</Text>
        )}

        <View style={styles.divider} />

        <Text style={styles.title}>
          FACTURA {data.documentLetter} (COD. {String(data.cbteTipoCode).padStart(2, '0')})
        </Text>
        <Text style={styles.center}>{data.fullNumber}</Text>
        <Text style={styles.center}>{data.issueDate}</Text>

        <View style={styles.divider} />

        <Text>{data.customerName}</Text>
        {data.customerTaxIdLabel && (
          <Text>
            {data.customerTaxIdLabel}
            {data.customerTaxId ? ` ${data.customerTaxId}` : ''}
          </Text>
        )}
        {data.customerTaxConditionLabel && <Text>{data.customerTaxConditionLabel}</Text>}

        <View style={styles.divider} />

        {data.lines.map((line, i) => (
          <View key={i}>
            <Text style={styles.lineDesc}>{line.description}</Text>
            <View style={styles.lineDetail}>
              <Text>
                {line.quantity} x {line.unitPrice}
              </Text>
              <Text>{line.lineTotal}</Text>
            </View>
          </View>
        ))}

        <View style={styles.divider} />

        {data.subtotalWithoutVat && (
          <View style={styles.totalsRow}>
            <Text>Subtotal</Text>
            <Text>{data.subtotalWithoutVat}</Text>
          </View>
        )}
        {data.netTaxed && (
          <View style={styles.totalsRow}>
            <Text>Neto Gravado</Text>
            <Text>{data.netTaxed}</Text>
          </View>
        )}
        {data.taxBuckets.map((bucket, i) => (
          <View style={styles.totalsRow} key={i}>
            <Text>{bucket.label}</Text>
            <Text>{bucket.tax}</Text>
          </View>
        ))}
        {data.netExempt && (
          <View style={styles.totalsRow}>
            <Text>Exento</Text>
            <Text>{data.netExempt}</Text>
          </View>
        )}
        {data.netUntaxed && (
          <View style={styles.totalsRow}>
            <Text>No Gravado</Text>
            <Text>{data.netUntaxed}</Text>
          </View>
        )}
        <View style={styles.grandTotalRow}>
          <Text style={styles.bold}>TOTAL {data.currencyCode}</Text>
          <Text style={styles.bold}>{data.total}</Text>
        </View>

        <View style={styles.divider} />

        <Text style={styles.center}>CAE: {data.cae}</Text>
        <Text style={styles.center}>Vto. CAE: {data.caeExpiry}</Text>
        <Image style={styles.qrImage} src={data.qrDataUri} />
      </Page>
    </Document>
  );
}
