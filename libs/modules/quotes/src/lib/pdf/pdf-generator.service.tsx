import { Injectable } from '@nestjs/common';
import { renderToBuffer } from '@react-pdf/renderer';
import type { PdfStyle } from '@plexo/database';
import { registerPdfFonts } from './fonts.js';
import type { QuotePdfData } from './pdf-data.js';
import { CompactoTemplate } from './templates/compacto.js';
import { LetrasGrandesTemplate } from './templates/letras-grandes.js';
import { ModernoTemplate } from './templates/moderno.js';
import { NaturalTemplate } from './templates/natural.js';
import { TradicionalTemplate } from './templates/tradicional.js';

/** Picks one of the 5 visual templates (user's own default preference, see
 * User.quotePdfStyle, overridable per-download) and renders it to a PDF
 * buffer - same data shape for all 5, see pdf-data.ts. Mirrors
 * @plexo/purchases' PdfGeneratorService exactly. */
@Injectable()
export class PdfGeneratorService {
  constructor() {
    registerPdfFonts();
  }

  async generate(style: PdfStyle, data: QuotePdfData): Promise<Buffer> {
    return renderToBuffer(this.pickTemplate(style, data));
  }

  private pickTemplate(style: PdfStyle, data: QuotePdfData) {
    switch (style) {
      case 'MODERNO':
        return <ModernoTemplate data={data} />;
      case 'COMPACTO':
        return <CompactoTemplate data={data} />;
      case 'TRADICIONAL':
        return <TradicionalTemplate data={data} />;
      case 'NATURAL':
        return <NaturalTemplate data={data} />;
      case 'LETRAS_GRANDES':
        return <LetrasGrandesTemplate data={data} />;
    }
  }
}
