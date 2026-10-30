import { suggestDocumentLetter } from './documentLetter';

describe('suggestDocumentLetter', () => {
  it('does not suggest anything when the tenant has not configured its own condition yet', () => {
    const result = suggestDocumentLetter(null, '20-11111111-2', 'Responsable Inscripto');
    expect(result).toEqual({
      letter: null,
      locked: false,
      reason: expect.stringContaining('Conexión con ARCA → Datos de la empresa'),
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

  it('forces Factura B for a customer identified only by DNI', () => {
    expect(suggestDocumentLetter('RESPONSABLE_INSCRIPTO', '25.123.456', null)).toEqual({
      letter: 'B',
      locked: true,
      reason: expect.stringContaining('Consumidor Final'),
    });
  });

  it('forces Factura A when the customer is Monotributo (RG 5003/2021)', () => {
    expect(suggestDocumentLetter('RESPONSABLE_INSCRIPTO', '20-11111111-2', 'Monotributo (Categoría B)')).toEqual({
      letter: 'A',
      locked: true,
      reason: expect.stringContaining('RG 5003/2021'),
    });
    expect(suggestDocumentLetter('RESPONSABLE_INSCRIPTO', '20-11111111-2', 'Responsable Monotributo').letter).toBe('A');
    expect(suggestDocumentLetter('RESPONSABLE_INSCRIPTO', '20-11111111-2', 'Monotributista Social').letter).toBe('A');
  });

  it('forces Factura B when the customer is Exento', () => {
    expect(suggestDocumentLetter('RESPONSABLE_INSCRIPTO', '20-11111111-2', 'IVA Exento')).toEqual({
      letter: 'B',
      locked: true,
      reason: expect.stringContaining('Exento'),
    });
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
