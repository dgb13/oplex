import { Prisma } from '@plexo/database';
import { buildCutList, groupUnplaced, maxUnitsByPieces, planCuts } from './cut-plan.js';

const d = (n: number) => new Prisma.Decimal(n);
const line = (length: number, cutsCount: number, inputArticleVariantId = 'tubo') => ({
  inputArticleVariantId,
  quantity: d(length * cutsCount),
  length: d(length),
  cutsCount,
});
const piece = (id: string, length: number) => ({ id, currentLength: d(length) });

describe('buildCutList', () => {
  it('expands every line of the insumo times the units, largest first', () => {
    const cuts = buildCutList([line(520, 2), line(1200, 1), line(999, 1, 'otro')], 'tubo', 2);
    expect(cuts.map(String)).toEqual(['1200', '1200', '520', '520', '520', '520']);
  });

  it('treats a line without length/cutsCount as one cut of `quantity` per unit', () => {
    const cuts = buildCutList([{ inputArticleVariantId: 'tubo', quantity: d(700), length: null, cutsCount: null }], 'tubo', 3);
    expect(cuts.map(String)).toEqual(['700', '700', '700']);
  });
});

describe('planCuts', () => {
  it('2 cortes de 1200 en barras de 2000: una barra por corte, nunca 2000 + 400', () => {
    const { slots, unplaced } = planCuts([d(1200), d(1200)], [piece('a', 2000), piece('b', 2000)]);
    expect(unplaced).toHaveLength(0);
    expect(slots.map((s) => s.cuts.map(String))).toEqual([['1200'], ['1200']]);
    expect(slots.map((s) => s.remaining.toString())).toEqual(['800', '800']);
  });

  it('leaves out a cut that fits in no single piece, even if the mm add up', () => {
    const { unplaced } = planCuts([d(1200)], [piece('a', 800), piece('b', 800)]);
    expect(unplaced.map(String)).toEqual(['1200']);
  });

  it('prefers the smallest piece that fits, reusing leftovers of pieces already in the plan', () => {
    const { slots } = planCuts([d(520), d(1200)], [piece('corta', 2000), piece('larga', 6000)]);
    // 1200 -> corta (sobran 800), 520 -> ese sobrante, no la de 6000.
    expect(slots.find((s) => s.piece.id === 'corta')?.cuts.map(String)).toEqual(['1200', '520']);
    expect(slots.find((s) => s.piece.id === 'larga')?.cuts).toEqual([]);
  });
});

describe('maxUnitsByPieces', () => {
  it('counts whole units that fit, below the mm-only bound', () => {
    // 2 barras de 2000, 2 cortes de 1200 por unidad: por mm 4000/2400 = 1;
    // con 3 barras por mm serían 2 (6000/2400) pero entran sólo 3 cortes
    // de 1200 (uno por barra) -> 1 unidad.
    expect(maxUnitsByPieces([line(1200, 2)], 'tubo', [piece('a', 2000), piece('b', 2000), piece('c', 2000)], 2)).toBe(1);
  });

  it('is 0 when not even one unit fits', () => {
    expect(maxUnitsByPieces([line(1200, 1)], 'tubo', [piece('a', 800), piece('b', 800)], 1)).toBe(0);
  });
});

describe('groupUnplaced', () => {
  it('groups leftover cuts by length', () => {
    expect(groupUnplaced([d(1200), d(1200), d(520)]).map((g) => [g.cutLength.toString(), g.count])).toEqual([
      ['1200', 2],
      ['520', 1],
    ]);
  });
});
