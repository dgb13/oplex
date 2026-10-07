import { suggestDocumentLetter } from './documentLetter';

describe('suggestDocumentLetter', () => {
  it('does not suggest anything when the tenant has not configured its own condition yet', () => {
    const result = suggestDocumentLetter(null, '20-11111111-2', 'Responsable Inscripto');
    expect(result).toEqual({
      letter: null,
      locked: false,
      reason: expect.stringContaining('Contabilidad → ARCA → Datos de la empresa'),
    });
  });

  it('forces Factura C for a Monotributo issuer, regardless of the customer', () => {
    expect(suggestDocumentLetter('MONOTRIBUTO', '20-11111111-2', 'Responsable Inscripto').letter).toBe(
      'C',
    );
    expect(suggestDocumentLetter('MONOTRIBUTO', null, null)).toEqual({
      letter: 'C',
      locked: true,
      reason: expect.stringContaining('Monotributo/Exento'),
    });
  });

  it('forces Factura C for an Exento issuer, regardless of the customer', () => {
    expect(suggestDocumentLetter('EXENTO', '20-11111111-2', 'Responsable Inscripto').letter).toBe('C');
  });

  it('forces Factura A when a Responsable Inscripto issuer bills a Responsable Inscripto customer', () => {
    const result = suggestDocumentLetter('RESPONSABLE_INSCRIPTO', '20-11111111-2', 'Responsable Inscripto');
    expect(result).toEqual({ letter: 'A', locked: true, reason: expect.stringContaining('Factura A') });
  });

  it('forces Factura B for a customer without a CUIT (Consumidor Final)', () => {
    const result = suggestDocumentLetter('RESPONSABLE_INSCRIPTO', null, null);
    expect(result).toEqual({
      letter: 'B',
      locked: true,
      reason: expect.stringContaining('Consumidor Final'),
    });
  });

  it('forces Factura B when the customer is Monotributo or Exento', () => {
    expect(
      suggestDocumentLetter('RESPONSABLE_INSCRIPTO', '20-11111111-2', 'Monotributo (Categoría B)').letter,
    ).toBe('B');
    expect(suggestDocumentLetter('RESPONSABLE_INSCRIPTO', '20-11111111-2', 'IVA Exento').letter).toBe('B');
  });

  it('suggests (but does not lock) Factura B when the customer has a CUIT but an unknown tax condition', () => {
    const result = suggestDocumentLetter('RESPONSABLE_INSCRIPTO', '20-11111111-2', null);
    expect(result).toEqual({
      letter: 'B',
      locked: false,
      reason: expect.stringContaining('No se conoce la condición IVA'),
    });
  });
});
