import { Image, Text, View } from '@react-pdf/renderer';
import type { Style } from '@react-pdf/types';
import type { QuotePdfData, QuotePdfEmitter } from '../pdf-data.js';

/** Logo cargado en Preferencias o, si no hay, un recuadro con las iniciales. */
export function Logo({
  emitter,
  size,
  radius = 0,
  background,
  color = '#ffffff',
  fontFamily,
  fontSize,
}: {
  emitter: QuotePdfEmitter;
  size: number;
  radius?: number;
  background?: string;
  color?: string;
  fontFamily?: string;
  fontSize?: number;
}) {
  if (emitter.logo) {
    return <Image src={emitter.logo} style={{ width: size, height: size, objectFit: 'contain' }} />;
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: background ?? emitter.brandColor,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color, fontFamily, fontWeight: 700, fontSize: fontSize ?? size * 0.36 }}>{emitter.initials}</Text>
    </View>
  );
}

export function joinDefined(parts: (string | null | undefined)[], separator = ' · '): string {
  return parts.filter((part) => part && part.trim()).join(separator);
}

/** "CUIT … · IVA Responsable Inscripto · IIBB … · Inicio de actividades …" */
export function fiscalLine(emitter: QuotePdfEmitter): string {
  return joinDefined([
    emitter.taxId ? `CUIT ${emitter.taxId}` : null,
    emitter.taxConditionLabel,
    emitter.grossIncomeNumber ? `IIBB ${emitter.grossIncomeNumber}` : null,
    emitter.activityStart ? `Inicio de actividades ${emitter.activityStart}` : null,
  ]);
}

export function contactLine(emitter: QuotePdfEmitter): string {
  return joinDefined([emitter.phone, emitter.email, emitter.website]);
}

export function lineTitle(line: QuotePdfData['lines'][number]): string {
  return line.variantLabel ? `${line.articleName} · ${line.variantLabel}` : line.articleName;
}

/** Leyenda bajo el total según cómo se muestra el IVA. */
export function vatNotice(data: QuotePdfData): string | null {
  if (data.vatMode === 'INCLUDED') return 'Precios finales con IVA incluido.';
  if (data.vatMode === 'NONE') return 'Precios finales.';
  return null;
}

export function customerTaxLine(data: QuotePdfData): string {
  return joinDefined([data.customer.taxId, data.customer.taxCondition]);
}

/** Pie fijo en todas las hojas, con "Página X de Y". */
export function PageFooter({ style, left, center }: { style: Style; left: string; center?: string }) {
  return (
    <View fixed style={[{ position: 'absolute', flexDirection: 'row', justifyContent: 'space-between' }, style]}>
      <Text>{left}</Text>
      {center ? <Text>{center}</Text> : null}
      <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
    </View>
  );
}
