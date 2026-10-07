import { Prisma } from '@plexo/database';
import { priceFor, stockShown } from './storefront-catalog.js';

describe('priceFor', () => {
  it('adds the article VAT for a Responsable Inscripto (sale price is net)', () => {
    const { price, netPrice } = priceFor(new Prisma.Decimal(1000), new Prisma.Decimal(21), 'RESPONSABLE_INSCRIPTO');
    expect(price.toNumber()).toBe(1210);
    expect(netPrice?.toNumber()).toBe(1000);
  });

  it('keeps the sale price as final for Monotributo and Exento', () => {
    expect(priceFor(new Prisma.Decimal(1000), new Prisma.Decimal(21), 'MONOTRIBUTO')).toEqual({
      price: new Prisma.Decimal(1000),
      netPrice: null,
    });
    expect(priceFor(new Prisma.Decimal(1000), new Prisma.Decimal(21), 'EXENTO').price.toNumber()).toBe(1000);
  });

  it('rounds the final price to cents', () => {
    expect(priceFor(new Prisma.Decimal('99.99'), new Prisma.Decimal('10.5'), 'RESPONSABLE_INSCRIPTO').price.toNumber()).toBe(110.49);
  });
});

describe('stockShown', () => {
  it('LOW only reveals 5 or less', () => {
    expect(stockShown(3, 'LOW')).toBe(3);
    expect(stockShown(5, 'LOW')).toBe(5);
    expect(stockShown(6, 'LOW')).toBeNull();
  });

  it('ALWAYS reveals and NEVER hides the quantity', () => {
    expect(stockShown(40, 'ALWAYS')).toBe(40);
    expect(stockShown(2, 'NEVER')).toBeNull();
  });
});
