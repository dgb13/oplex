import { Prisma } from '../generated/client.js';
import { getOwnTaxCondition, isVatRecoverable, realUnitCost, vatRatePercent } from './vat-cost.js';

function cost(amount: number, includesVat: boolean, condition: string | null, vatRate: number = 21) {
  return realUnitCost({ amount, includesVat, vatRate, condition: condition as never }).toFixed(2);
}

describe('isVatRecoverable', () => {
  it('sólo Responsable Inscripto recupera el IVA; sin condición no se sabe (null)', () => {
    expect(isVatRecoverable('RESPONSABLE_INSCRIPTO')).toBe(true);
    expect(isVatRecoverable('MONOTRIBUTO')).toBe(false);
    expect(isVatRecoverable('EXENTO')).toBe(false);
    expect(isVatRecoverable(null)).toBeNull();
    expect(isVatRecoverable(undefined)).toBeNull();
  });
});

describe('vatRatePercent', () => {
  it('devuelve la alícuota de un PERCENTAGE y 0 para el resto', () => {
    expect(vatRatePercent({ calculationType: 'PERCENTAGE', rate: new Prisma.Decimal(10.5) } as never).toNumber()).toBe(10.5);
    expect(vatRatePercent({ calculationType: 'EXENTO', rate: null } as never).toNumber()).toBe(0);
    expect(vatRatePercent(null).toNumber()).toBe(0);
  });
});

describe('realUnitCost', () => {
  it('Responsable Inscripto: costo real SIN IVA', () => {
    expect(cost(121, true, 'RESPONSABLE_INSCRIPTO')).toBe('100.00');
    expect(cost(100, false, 'RESPONSABLE_INSCRIPTO')).toBe('100.00');
  });

  it('Monotributo: costo real CON IVA', () => {
    expect(cost(100, false, 'MONOTRIBUTO')).toBe('121.00');
    expect(cost(121, true, 'MONOTRIBUTO')).toBe('121.00');
  });

  it('Exento: costo real CON IVA, igual que Monotributo', () => {
    expect(cost(100, false, 'EXENTO')).toBe('121.00');
    expect(cost(121, true, 'EXENTO')).toBe('121.00');
  });

  it('sin condición cargada: el costo queda tal cual se escribió', () => {
    expect(cost(100, false, null)).toBe('100.00');
    expect(cost(121, true, null)).toBe('121.00');
  });

  it('alícuota 0 (exento/no gravado): no hay IVA que sumar ni sacar', () => {
    for (const condition of ['RESPONSABLE_INSCRIPTO', 'MONOTRIBUTO', 'EXENTO', null]) {
      expect(cost(100, false, condition, 0)).toBe('100.00');
      expect(cost(100, true, condition, 0)).toBe('100.00');
    }
  });
});

describe('getOwnTaxCondition', () => {
  it('lee ownTaxCondition de TenantSettings', async () => {
    const findFirst = jest.fn().mockResolvedValue({ ownTaxCondition: 'MONOTRIBUTO' });

    expect(await getOwnTaxCondition({ tenantSettings: { findFirst } } as never)).toBe('MONOTRIBUTO');
    expect(findFirst).toHaveBeenCalledWith({ select: { ownTaxCondition: true } });
  });

  it('devuelve null si el tenant no tiene settings', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);

    expect(await getOwnTaxCondition({ tenantSettings: { findFirst } } as never)).toBeNull();
  });
});
