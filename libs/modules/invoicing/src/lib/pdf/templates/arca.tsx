import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { InvoicePdfData } from '../pdf-data.js';

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 8.5, fontFamily: 'Helvetica', color: '#0f172a' },
  headerRow: { flexDirection: 'row', marginBottom: 8 },
  headerHalf: { flex: 1 },
  issuerName: { fontSize: 12, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  letterBox: {
    width: 60,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#0f172a',
    marginHorizontal: 8,
  },
  letterBig: { fontSize: 26, fontFamily: 'Helvetica-Bold', paddingTop: 2 },
  letterCode: { fontSize: 7, paddingBottom: 2 },
  docTitle: { fontSize: 13, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  docNumber: { fontSize: 10, textAlign: 'right', marginTop: 2 },
  docMeta: { textAlign: 'right', marginTop: 4 },
  divider: { borderBottomWidth: 1, borderBottomColor: '#0f172a', marginVertical: 8 },
  partiesRow: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  partyBox: { flex: 1, padding: 8, borderWidth: 1, borderColor: '#94a3b8', borderRadius: 3 },
  partyTitle: { fontFamily: 'Helvetica-Bold', marginBottom: 3, fontSize: 8 },
  table: { marginTop: 4 },
  tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#0f172a', paddingBottom: 3, marginBottom: 3 },
  tableRow: { flexDirection: 'row', paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: '#cbd5e1' },
  colDesc: { flex: 4 },
  colSku: { flex: 1.5 },
  colQty: { flex: 1, textAlign: 'right' },
  colPrice: { flex: 1.3, textAlign: 'right' },
  colDisc: { flex: 0.9, textAlign: 'right' },
  colTotal: { flex: 1.3, textAlign: 'right' },
  th: { fontFamily: 'Helvetica-Bold' },
  totalsSection: { marginTop: 10, alignItems: 'flex-end' },
  totalsRow: { flexDirection: 'row', width: 220, justifyContent: 'space-between', paddingVertical: 1 },
  grandTotalRow: {
    flexDirection: 'row',
    width: 220,
    justifyContent: 'space-between',
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#0f172a',
  },
  grandTotalLabel: { fontFamily: 'Helvetica-Bold', fontSize: 11 },
  grandTotalValue: { fontFamily: 'Helvetica-Bold', fontSize: 11 },
  mutedRow: { flexDirection: 'row', width: 220, justifyContent: 'space-between', paddingTop: 3, color: '#475569', fontSize: 7.5 },
  footer: { position: 'absolute', bottom: 24, left: 28, right: 28, flexDirection: 'row', alignItems: 'flex-end' },
  qrImage: { width: 70, height: 70 },
  caeBox: { marginLeft: 16 },
});

export function ArcaTemplate({ data, pageSize }: { data: InvoicePdfData; pageSize: 'A4' | 'A5' }) {
  return (
    <Document>
      <Page size={pageSize} style={styles.page}>
        <View style={styles.headerRow}>
          <View style={styles.headerHalf}>
            <Text style={styles.issuerName}>{data.issuerName}</Text>
            {data.issuerTaxId && <Text>CUIT {data.issuerTaxId}</Text>}
            {data.issuerTaxConditionLabel && <Text>{data.issuerTaxConditionLabel}</Text>}
            {data.issuerFiscalAddress && <Text>{data.issuerFiscalAddress}</Text>}
            {data.issuerGrossIncomeNumber && <Text>Ingresos Brutos: {data.issuerGrossIncomeNumber}</Text>}
            {data.issuerActivityStartDate && <Text>Inicio de actividades: {data.issuerActivityStartDate}</Text>}
          </View>

          <View style={styles.letterBox}>
            <Text style={styles.letterBig}>{data.documentLetter}</Text>
            <Text style={styles.letterCode}>COD. {String(data.cbteTipoCode).padStart(2, '0')}</Text>
          </View>

          <View style={styles.headerHalf}>
            <Text style={styles.docTitle}>FACTURA</Text>
            <Text style={styles.docNumber}>{data.fullNumber}</Text>
            <View style={styles.docMeta}>
              <Text>Fecha de Emisión: {data.issueDate}</Text>
              {data.serviceDueDate && <Text>Vencimiento: {data.serviceDueDate}</Text>}
              <Text>Concepto: {data.conceptLabel}</Text>
              <Text>
                Moneda: {data.currencyCode}
                {!data.isBaseCurrency ? ` (Cotización: ${data.exchangeRate})` : ''}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.partiesRow}>
          <View style={styles.partyBox}>
            <Text style={styles.partyTitle}>Cliente</Text>
            <Text>{data.customerName}</Text>
            {data.customerTaxIdLabel && (
              <Text>
                {data.customerTaxIdLabel}
                {data.customerTaxId ? ` ${data.customerTaxId}` : ''}
              </Text>
            )}
            {data.customerTaxConditionLabel && <Text>{data.customerTaxConditionLabel}</Text>}
            {data.customerFiscalAddress && <Text>{data.customerFiscalAddress}</Text>}
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.colDesc, styles.th]}>Descripción</Text>
            <Text style={[styles.colSku, styles.th]}>Código</Text>
            <Text style={[styles.colQty, styles.th]}>Cant.</Text>
            <Text style={[styles.colPrice, styles.th]}>Precio Unit.</Text>
            {data.hasLineDiscounts && <Text style={[styles.colDisc, styles.th]}>Bonif.</Text>}
            <Text style={[styles.colTotal, styles.th]}>Subtotal</Text>
          </View>
          {data.lines.map((line, i) => (
            <View style={styles.tableRow} key={i}>
              <Text style={styles.colDesc}>{line.description}</Text>
              <Text style={styles.colSku}>{line.sku}</Text>
              <Text style={styles.colQty}>{line.quantity}</Text>
              <Text style={styles.colPrice}>{line.unitPrice}</Text>
              {data.hasLineDiscounts && <Text style={styles.colDisc}>{line.discount ?? ''}</Text>}
              <Text style={styles.colTotal}>{line.lineTotal}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsSection}>
          {data.totalRows.map((row, i) => (
            <View style={styles.totalsRow} key={i}>
              <Text>{row.label}</Text>
              <Text>{row.amount}</Text>
            </View>
          ))}
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>Importe Total</Text>
            <Text style={styles.grandTotalValue}>
              {data.currencyCode} {data.total}
            </Text>
          </View>
          {data.vatContained && (
            <View style={styles.mutedRow}>
              <Text>IVA contenido</Text>
              <Text>{data.vatContained}</Text>
            </View>
          )}
        </View>

        <View style={styles.footer} fixed>
          <Image style={styles.qrImage} src={data.qrDataUri} />
          <View style={styles.caeBox}>
            <Text>CAE N°: {data.cae}</Text>
            <Text>Fecha de Vto. de CAE: {data.caeExpiry}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
