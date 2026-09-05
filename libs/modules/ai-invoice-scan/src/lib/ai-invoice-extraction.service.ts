import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_CLIENT } from './anthropic-client.token.js';
import type {
  AiInvoiceExtractionResult,
  ClaudeExtractionOutput,
  ExtractedField,
} from './ai-invoice-extraction.types.js';
import { EXTRACT_INVOICE_TOOL } from './extract-invoice.tool.js';
import { decodeAfipQrFromImage, type DecodedAfipQr } from './qr-decode.util.js';

const DEFAULT_MODEL = 'claude-sonnet-5';
const MAX_TOKENS = 2048;

const EXTRACTION_PROMPT = `Ésta es una factura de compra argentina (foto o escaneo). Extraé sus datos usando la herramienta extract_purchase_invoice_data. Para cada campo, asigná un "confidence" honesto entre 0 y 1 - bajo (menos de 0.6) si el texto está borroso, cortado, o estás adivinando; alto (más de 0.9) sólo si lo leíste con total claridad. subtotal es el NETO antes de impuestos, no el total final. Las líneas de impuestos (taxLines) van una por cada renglón de IVA/percepción que aparezca discriminado en la factura - si no hay ninguna discriminada, dejá el array vacío.`;

function qrField<T>(qr: DecodedAfipQr | null, pick: (qr: DecodedAfipQr) => T): T | null {
  return qr ? pick(qr) : null;
}

/** Combina QR (verdad absoluta si está presente) + la lectura de Claude
 * (siempre presente, con su propio confidence) en un único resultado por
 * campo - ver docs/plan-carga-comprobantes-ia.md, sección 2 y 5. El QR
 * nunca trae el detalle de impuestos (taxLines) ni subtotal (su "importe"
 * es el TOTAL con impuestos, no el neto) - esos dos siempre vienen de la
 * IA, con o sin QR presente. */
function mergeField<T>(qrValue: T | null, ai: { value: T; confidence: number }): ExtractedField<T> {
  if (qrValue !== null && qrValue !== '') {
    return { value: qrValue, source: 'qr' };
  }
  return { value: ai.value, source: 'ai', confidence: ai.confidence };
}

@Injectable()
export class AiInvoiceExtractionService {
  constructor(@Inject(ANTHROPIC_CLIENT) private readonly anthropic: Anthropic) {}

  async extract(buffer: Buffer, mimetype: string): Promise<AiInvoiceExtractionResult> {
    // Sólo imágenes por ahora - PDF no rasteriza todavía (ver
    // qr-decode.util.ts). Un QR ilegible/ausente devuelve null, camino
    // normal - nunca tira la extracción abajo por esto.
    const decodedQr = mimetype.startsWith('image/') ? await this.tryDecodeQr(buffer) : null;
    const ai = await this.callClaude(buffer, mimetype);
    return this.merge(decodedQr, ai);
  }

  private async tryDecodeQr(buffer: Buffer): Promise<DecodedAfipQr | null> {
    try {
      return await decodeAfipQrFromImage(buffer);
    } catch {
      // Imagen corrupta/formato no soportado por Jimp - degrada a "sin QR",
      // no debe tumbar la extracción entera (ver "la IA acelera, nunca
      // bloquea", docs/plan-carga-comprobantes-ia.md sección 3).
      return null;
    }
  }

  private async callClaude(buffer: Buffer, mimetype: string): Promise<ClaudeExtractionOutput> {
    const response = await this.anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL,
      max_tokens: MAX_TOKENS,
      tools: [EXTRACT_INVOICE_TOOL],
      tool_choice: { type: 'tool', name: EXTRACT_INVOICE_TOOL.name },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: mimetype === 'application/pdf' ? 'document' : 'image',
              source: { type: 'base64', media_type: mimetype, data: buffer.toString('base64') },
            } as never,
            { type: 'text', text: EXTRACTION_PROMPT },
          ],
        },
      ],
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use',
    );
    if (!toolUse) {
      throw new InternalServerErrorException('Claude no devolvió una extracción estructurada');
    }
    return toolUse.input as ClaudeExtractionOutput;
  }

  private merge(qr: DecodedAfipQr | null, ai: ClaudeExtractionOutput): AiInvoiceExtractionResult {
    // supplierInvoiceNumber: si hay QR, se reconstruye a partir de
    // ptoVta+nroCmp (estructurado, verdad absoluta) en vez de confiar en
    // que la IA transcribió bien el formato "0001-00012345" - más preciso
    // que dejar que la IA lo arme de nuevo cuando ya lo tenemos exacto.
    const qrInvoiceNumber = qr ? `${qr.pointOfSale.padStart(4, '0')}-${qr.number.padStart(8, '0')}` : null;

    return {
      supplierCuit: mergeField(qrField(qr, (q) => q.issuerCuit), ai.supplierCuit),
      // El nombre del proveedor nunca viene en el QR (sólo el CUIT) -
      // siempre de la IA.
      supplierName: { value: ai.supplierName.value, source: 'ai', confidence: ai.supplierName.confidence },
      supplierInvoiceNumber: mergeField(qrInvoiceNumber, ai.supplierInvoiceNumber),
      supplierInvoiceDate: mergeField(qrField(qr, (q) => q.issueDate), ai.supplierInvoiceDate),
      documentLetter: mergeField(qrField(qr, (q) => q.documentLetter), ai.documentLetter),
      pointOfSale: mergeField(qrField(qr, (q) => q.pointOfSale), ai.pointOfSale),
      number: mergeField(qrField(qr, (q) => q.number), ai.number),
      currencyCode: mergeField(qrField(qr, (q) => q.currencyCode), ai.currencyCode),
      // subtotal y taxLines: el QR nunca los trae (su "importe" es el TOTAL
      // con impuestos, no el neto) - siempre de la IA, con o sin QR.
      subtotal: { value: ai.subtotal.value, source: 'ai', confidence: ai.subtotal.confidence },
      taxLines: ai.taxLines.map((line) => ({
        type: line.type,
        concept: { value: line.concept.value, source: 'ai', confidence: line.concept.confidence },
        amount: { value: line.amount.value, source: 'ai', confidence: line.amount.confidence },
        netAmount: { value: line.netAmount.value, source: 'ai', confidence: line.netAmount.confidence },
        taxRate: { value: line.taxRate.value, source: 'ai', confidence: line.taxRate.confidence },
      })),
    };
  }
}
