import { BadRequestException } from '@nestjs/common';
import { normalizePointOfSaleNumber } from './point-of-sale.js';

describe('normalizePointOfSaleNumber', () => {
  it('pads a new point of sale to 5 digits', () => {
    expect(normalizePointOfSaleNumber('8')).toBe('00008');
    expect(normalizePointOfSaleNumber('0008')).toBe('00008');
    expect(normalizePointOfSaleNumber(' 00008 ')).toBe('00008');
    expect(normalizePointOfSaleNumber('12345')).toBe('12345');
  });

  it('keeps the stored text when the number did not change, so older vouchers stay in the same sequence', () => {
    expect(normalizePointOfSaleNumber('0001', '0001')).toBe('0001');
    expect(normalizePointOfSaleNumber('1', '0001')).toBe('0001');
    expect(normalizePointOfSaleNumber('00001', '0001')).toBe('0001');
  });

  it('pads when the number changes', () => {
    expect(normalizePointOfSaleNumber('2', '0001')).toBe('00002');
  });

  it.each(['', 'abc', '8a', '123456', '0', '00000', '-1'])('rejects %p', (value) => {
    expect(() => normalizePointOfSaleNumber(value)).toThrow(BadRequestException);
  });
});
