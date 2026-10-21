import {
  effectiveNextDocumentNumber,
  highestDocumentNumber,
  takeDocumentNumber,
  type DocumentSeries,
} from './document-numbering.js';

/** In-memory series: one user's counter on `prefix`, plus the numbers the
 * tenant already used (some of them by other users). */
function memorySeries(prefix: string, counter: number, issued: string[]): DocumentSeries & { counter(): number } {
  let next = counter;
  return {
    counter: () => next,
    increment: async () => ({ prefix, next: ++next }),
    setNext: async (value) => {
      next = value;
    },
    exists: async (number) => issued.includes(number),
    numbersWithPrefix: async (p) => issued.filter((n) => n.startsWith(`${p}-`)),
  };
}

describe('takeDocumentNumber', () => {
  it('hands out the counter value when it is free', async () => {
    const series = memorySeries('OC', 4, []);
    await expect(takeDocumentNumber(series)).resolves.toBe('OC-000004');
    expect(series.counter()).toBe(5);
  });

  it("jumps past another user's numbers on the same prefix", async () => {
    // Second user on the default prefix: their counter says 1, another
    // user already issued 1..3.
    const series = memorySeries('PED', 1, ['PED-000001', 'PED-000002', 'PED-000003', 'OTRO-000009']);
    await expect(takeDocumentNumber(series)).resolves.toBe('PED-000004');
    expect(series.counter()).toBe(5);
  });

  it('does not move the counter backwards past a gap', async () => {
    // Taken number below the user's counter (e.g. after a prefix change):
    // just keep incrementing.
    const series = memorySeries('OP', 2, ['OP-000002']);
    await expect(takeDocumentNumber(series)).resolves.toBe('OP-000003');
  });
});

describe('effectiveNextDocumentNumber', () => {
  it('keeps the stored counter when that number is free', async () => {
    await expect(effectiveNextDocumentNumber('PRE', 3, memorySeries('PRE', 3, ['PRE-000001']))).resolves.toBe(3);
  });

  it('previews the number after the highest one in use', async () => {
    await expect(
      effectiveNextDocumentNumber('PRE', 1, memorySeries('PRE', 1, ['PRE-000001', 'PRE-000007'])),
    ).resolves.toBe(8);
  });
});

describe('highestDocumentNumber', () => {
  it('ignores numbers that are not "{prefix}-n"', () => {
    expect(highestDocumentNumber('PRE', ['PRE-000002', 'PRE-abc', 'PRE-000010'])).toBe(10);
    expect(highestDocumentNumber('PRE', [])).toBe(0);
  });
});
