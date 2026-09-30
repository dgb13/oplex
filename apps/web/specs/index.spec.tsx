import { COMPARISON, COMPETITORS } from '../src/components/landing/data';

// "/" ya no redirige al login: es la landing pública (ver
// src/app/page.tsx). Lo que vale la pena cuidar acá es la regla legal de la
// tabla comparativa: sólo datos verificables, y nunca afirmar que un
// competidor "no tiene" algo - lo que no encontramos publicado es
// "Consultar".
describe('Landing - tabla comparativa', () => {
  const rows = COMPARISON.flatMap((g) => g.rows);

  it('tiene una celda por competidor en cada fila', () => {
    for (const row of rows) {
      expect(row.others).toHaveLength(COMPETITORS.length);
    }
  });

  it('nunca le atribuye un "no" a un competidor', () => {
    for (const row of rows) {
      for (const cell of row.others) {
        expect(cell.text).not.toMatch(/^no\b/i);
        if (cell.kind === 'ask') {
          expect(cell.text).toBe('Consultar');
        }
      }
    }
  });
});
