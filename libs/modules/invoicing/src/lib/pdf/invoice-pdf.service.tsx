import { Injectable } from '@nestjs/common';
import type { InvoicePdfFormat, PdfStyle } from '@plexo/database';
import { renderToBuffer } from '@react-pdf/renderer';
import { registerPdfFonts } from './fonts.js';
import type { InvoicePdfData } from './pdf-data.js';
import { CompactoTemplate } from './templates/compacto.js';
import { LetrasGrandesTemplate } from './templates/letras-grandes.js';
import { ModernoTemplate } from './templates/moderno.js';
import { NaturalTemplate } from './templates/natural.js';
import { TicketTemplate } from './templates/ticket.js';
import { TradicionalTemplate } from './templates/tradicional.js';

/** Facturas y notas de crédito: los mismos 5 estilos visuales que
 * Cotizaciones/Compras (User.invoicePdfStyle) en A4 o A5, con los datos que
 * exige ARCA. El ticket (impresora térmica) tiene un solo diseño. */
@Injectable()
export class InvoicePdfService {
  constructor() {
    registerPdfFonts();
  }

  async generate(format: InvoicePdfFormat, style: PdfStyle, data: InvoicePdfData): Promise<Buffer> {
    return renderToBuffer(this.pickTemplate(format, style, data));
  }

  private pickTemplate(format: InvoicePdfFormat, style: PdfStyle, data: InvoicePdfData) {
    if (format === 'TICKET') return <TicketTemplate data={data} />;
    const size = format;
    switch (style) {
      case 'MODERNO':
        return <ModernoTemplate data={data} size={size} />;
      case 'COMPACTO':
        return <CompactoTemplate data={data} size={size} />;
      case 'TRADICIONAL':
        return <TradicionalTemplate data={data} size={size} />;
      case 'NATURAL':
        return <NaturalTemplate data={data} size={size} />;
      case 'LETRAS_GRANDES':
        return <LetrasGrandesTemplate data={data} size={size} />;
    }
  }
}
