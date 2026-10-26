import { buildVariantLabel } from './inventory';

describe('buildVariantLabel', () => {
  it('keeps the brand in front of the attributes so two brands of the same part look different', () => {
    const attributes = { 'Aplica a': 'VW Gol 1.6', 'Código OEM': '03C115561H' };
    expect(buildVariantLabel({ color: null, size: null, brand: 'MarcaA', attributes })).toBe(
      'MarcaA / VW Gol 1.6 / 03C115561H',
    );
    expect(buildVariantLabel({ color: null, size: null, brand: 'MarcaB', attributes })).toBe(
      'MarcaB / VW Gol 1.6 / 03C115561H',
    );
  });

  it('does not repeat the brand when it is already one of the attributes', () => {
    expect(
      buildVariantLabel({ color: null, size: null, brand: 'Nike', attributes: { Marca: 'Nike', Talle: 'M' } }),
    ).toBe('Nike / M');
  });

  it('falls back to color / size / brand when there are no attributes', () => {
    expect(buildVariantLabel({ color: 'Rojo', size: 'M', brand: null, attributes: null })).toBe('Rojo / M');
  });
});
