import { shortenGrossIncomeDetail } from './constancia-extraction.service.js';

describe('shortenGrossIncomeDetail', () => {
  it('drops the ARCA tax code and the long tax name from the constancia line', () => {
    expect(shortenGrossIncomeDetail('5445 - Régimen Simplificado Impuesto sobre Ingresos Brutos Mendoza')).toBe(
      'Régimen Simplificado Mendoza',
    );
  });

  it('keeps a registration number as is', () => {
    expect(shortenGrossIncomeDetail('0123456-7')).toBe('0123456-7');
    expect(shortenGrossIncomeDetail('Régimen Simplificado Mendoza')).toBe('Régimen Simplificado Mendoza');
  });

  it('never returns more than 50 characters, cutting at a word', () => {
    const result = shortenGrossIncomeDetail('Régimen Simplificado Provincia de Buenos Aires Agencia de Recaudación');
    expect(result).toBe('Régimen Simplificado Provincia de Buenos Aires');
    expect(result!.length).toBeLessThanOrEqual(50);
  });

  it('returns null for an empty value', () => {
    expect(shortenGrossIncomeDetail(null)).toBeNull();
    expect(shortenGrossIncomeDetail('   ')).toBeNull();
  });
});
