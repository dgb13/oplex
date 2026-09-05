import type Anthropic from '@anthropic-ai/sdk';
import { AiInvoiceExtractionService } from './ai-invoice-extraction.service.js';
import type { ClaudeExtractionOutput } from './ai-invoice-extraction.types.js';
import { decodeAfipQrFromImage } from './qr-decode.util.js';

jest.mock('./qr-decode.util.js', () => ({
  decodeAfipQrFromImage: jest.fn(),
}));

function makeClaudeOutput(overrides: Partial<ClaudeExtractionOutput> = {}): ClaudeExtractionOutput {
  return {
    supplierCuit: { value: '30111222339', confidence: 0.95 },
    supplierName: { value: 'Ferretería Norte SRL', confidence: 0.9 },
    supplierInvoiceNumber: { value: '0002-00004567', confidence: 0.85 },
    supplierInvoiceDate: { value: '2026-09-01', confidence: 0.9 },
    documentLetter: { value: 'A', confidence: 0.9 },
    pointOfSale: { value: '2', confidence: 0.9 },
    number: { value: '4567', confidence: 0.9 },
    subtotal: { value: 15000, confidence: 0.8 },
    currencyCode: { value: 'ARS', confidence: 0.95 },
    taxLines: [
      {
        type: 'IVA_CREDITO',
        concept: { value: 'IVA 21%', confidence: 0.8 },
        amount: { value: 3150, confidence: 0.8 },
        netAmount: { value: 15000, confidence: 0.8 },
        taxRate: { value: 21, confidence: 0.8 },
      },
    ],
    ...overrides,
  };
}

function makeAnthropicMock(output: ClaudeExtractionOutput) {
  const create = jest.fn().mockResolvedValue({
    content: [{ type: 'tool_use', name: 'extract_purchase_invoice_data', input: output }],
  });
  return { messages: { create } } as unknown as Anthropic;
}

describe('AiInvoiceExtractionService.extract', () => {
  beforeEach(() => {
    jest.mocked(decodeAfipQrFromImage).mockReset();
  });

  it('skips QR decoding entirely for a PDF (not supported yet) and uses Claude for every field', async () => {
    const anthropic = makeAnthropicMock(makeClaudeOutput());
    const service = new AiInvoiceExtractionService(anthropic);

    const result = await service.extract(Buffer.from('fake-pdf'), 'application/pdf');

    expect(decodeAfipQrFromImage).not.toHaveBeenCalled();
    expect(result.supplierCuit).toEqual({ value: '30111222339', source: 'ai', confidence: 0.95 });
    expect(result.documentLetter).toEqual({ value: 'A', source: 'ai', confidence: 0.9 });
    expect(result.subtotal).toEqual({ value: 15000, source: 'ai', confidence: 0.8 });
  });

  it('prefers the QR value over Claude for the fields the QR provides with certainty (image with a legible QR)', async () => {
    jest.mocked(decodeAfipQrFromImage).mockResolvedValue({
      issueDate: '2026-09-02',
      issuerCuit: '30716595549',
      pointOfSale: '3',
      documentLetter: 'B',
      number: '99',
      total: 20000,
      currencyCode: 'ARS',
      exchangeRate: 1,
      customerTaxId: '20270403949',
      cae: '71234567890123',
    });
    const anthropic = makeAnthropicMock(makeClaudeOutput({ documentLetter: { value: 'A', confidence: 0.4 } }));
    const service = new AiInvoiceExtractionService(anthropic);

    const result = await service.extract(Buffer.from('fake-image'), 'image/jpeg');

    // El QR gana aunque Claude haya leído otra cosa con baja confianza.
    expect(result.documentLetter).toEqual({ value: 'B', source: 'qr' });
    expect(result.supplierCuit).toEqual({ value: '30716595549', source: 'qr' });
    expect(result.supplierInvoiceDate).toEqual({ value: '2026-09-02', source: 'qr' });
    // supplierInvoiceNumber se reconstruye desde ptoVta+nroCmp del QR, no
    // de la transcripción de Claude.
    expect(result.supplierInvoiceNumber).toEqual({ value: '0003-00000099', source: 'qr' });
  });

  it('subtotal and taxLines always come from Claude, never from the QR (QR "importe" is the post-tax total)', async () => {
    jest.mocked(decodeAfipQrFromImage).mockResolvedValue({
      issueDate: '2026-09-02',
      issuerCuit: '30716595549',
      pointOfSale: '3',
      documentLetter: 'B',
      number: '99',
      total: 20000,
      currencyCode: 'ARS',
      exchangeRate: 1,
      customerTaxId: null,
      cae: '1',
    });
    const anthropic = makeAnthropicMock(makeClaudeOutput({ subtotal: { value: 16528.93, confidence: 0.75 } }));
    const service = new AiInvoiceExtractionService(anthropic);

    const result = await service.extract(Buffer.from('fake-image'), 'image/jpeg');

    expect(result.subtotal).toEqual({ value: 16528.93, source: 'ai', confidence: 0.75 });
    expect(result.taxLines).toHaveLength(1);
    expect(result.taxLines[0].amount).toEqual({ value: 3150, source: 'ai', confidence: 0.8 });
  });

  it('falls back to Claude entirely when the image has no legible QR', async () => {
    jest.mocked(decodeAfipQrFromImage).mockResolvedValue(null);
    const anthropic = makeAnthropicMock(makeClaudeOutput());
    const service = new AiInvoiceExtractionService(anthropic);

    const result = await service.extract(Buffer.from('fake-image'), 'image/jpeg');

    expect(result.documentLetter).toEqual({ value: 'A', source: 'ai', confidence: 0.9 });
  });

  it('degrades gracefully to "no QR" when decoding throws (corrupt/unsupported image), never failing the extraction', async () => {
    jest.mocked(decodeAfipQrFromImage).mockRejectedValue(new Error('unsupported image format'));
    const anthropic = makeAnthropicMock(makeClaudeOutput());
    const service = new AiInvoiceExtractionService(anthropic);

    const result = await service.extract(Buffer.from('fake-image'), 'image/jpeg');

    expect(result.documentLetter).toEqual({ value: 'A', source: 'ai', confidence: 0.9 });
  });

  it('throws when Claude does not return a tool_use block', async () => {
    const create = jest.fn().mockResolvedValue({ content: [{ type: 'text', text: 'no puedo leer esto' }] });
    const anthropic = { messages: { create } } as unknown as Anthropic;
    const service = new AiInvoiceExtractionService(anthropic);

    await expect(service.extract(Buffer.from('fake-pdf'), 'application/pdf')).rejects.toThrow(
      'no devolvió una extracción estructurada',
    );
  });
});
