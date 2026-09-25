import { Prisma, type BomLine } from '@plexo/database';

/**
 * Plan de corte 1D (barras/perfiles/caños) - lógica pura, sin base de
 * datos, compartida por los tres lugares que tienen que coincidir:
 * cuántas unidades se pueden producir (ProductionPlanningService), si una
 * orden confirmada tiene todo lo que necesita (ProductionOrderService) y
 * el corte real al completarla (ProductionService, apps/api).
 *
 * Regla del taller: cada corte sale ENTERO de una sola pieza - nunca se
 * empalman dos pedazos. Los cortes van de mayor a menor, cada uno a la
 * pieza más chica donde entra (best-fit decreasing); el sobrante de una
 * pieza ya usada sigue disponible para los cortes siguientes.
 */

type CutLine = Pick<BomLine, 'inputArticleVariantId' | 'quantity' | 'length' | 'cutsCount'>;

/** Todos los cortes que pide la receta de un insumo para `units`
 * unidades producidas, de mayor a menor. Una línea sin length/cutsCount
 * cargados cuenta como un corte de `quantity` mm por unidad. Cantidades
 * fraccionarias redondean para arriba - no existe medio corte. */
export function buildCutList(lines: CutLine[], inputArticleVariantId: string, units: number | Prisma.Decimal): Prisma.Decimal[] {
  const unitCount = new Prisma.Decimal(units).toNumber();
  const cuts: Prisma.Decimal[] = [];
  for (const line of lines.filter((l) => l.inputArticleVariantId === inputArticleVariantId)) {
    const cutLength = line.length ?? line.quantity;
    const count = Math.ceil((line.cutsCount ?? 1) * unitCount);
    for (let i = 0; i < count; i++) cuts.push(cutLength);
  }
  return cuts.sort((a, b) => b.comparedTo(a));
}

export interface CutPlanSlot<P> {
  piece: P;
  remaining: Prisma.Decimal;
  cuts: Prisma.Decimal[];
}

/** Asigna `cuts` a `pieces` sin tocar nada - `unplaced` son los cortes
 * que no entraron enteros en ninguna pieza. */
export function planCuts<P extends { currentLength: Prisma.Decimal }>(
  cuts: Prisma.Decimal[],
  pieces: P[],
): { slots: CutPlanSlot<P>[]; unplaced: Prisma.Decimal[] } {
  const slots: CutPlanSlot<P>[] = pieces.map((piece) => ({ piece, remaining: piece.currentLength, cuts: [] }));
  const unplaced: Prisma.Decimal[] = [];
  for (const cut of [...cuts].sort((a, b) => b.comparedTo(a))) {
    let best: CutPlanSlot<P> | undefined;
    for (const slot of slots) {
      if (slot.remaining.gte(cut) && (!best || slot.remaining.lt(best.remaining))) best = slot;
    }
    if (!best) {
      unplaced.push(cut);
      continue;
    }
    best.cuts.push(cut);
    best.remaining = best.remaining.sub(cut);
  }
  return { slots, unplaced };
}

/** Cuántas unidades completas entran en `pieces` (0..upperBound) - busca
 * el mayor n cuyo plan de corte no deja cortes afuera. `upperBound` es
 * el tope por mm totales, que el caller ya calculó. */
export function maxUnitsByPieces<P extends { currentLength: Prisma.Decimal }>(
  lines: CutLine[],
  inputArticleVariantId: string,
  pieces: P[],
  upperBound: number,
): number {
  const fits = (n: number) => planCuts(buildCutList(lines, inputArticleVariantId, n), pieces).unplaced.length === 0;
  let low = 0;
  let high = Math.max(0, Math.floor(upperBound));
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (fits(mid)) low = mid;
    else high = mid - 1;
  }
  return low;
}

/** Los cortes sin pieza agrupados por largo, para mostrarlos ("2 cortes
 * de 1200 mm"). */
export function groupUnplaced(unplaced: Prisma.Decimal[]): { cutLength: Prisma.Decimal; count: number }[] {
  const groups = new Map<string, { cutLength: Prisma.Decimal; count: number }>();
  for (const cut of unplaced) {
    const key = cut.toString();
    const group = groups.get(key) ?? { cutLength: cut, count: 0 };
    group.count += 1;
    groups.set(key, group);
  }
  return [...groups.values()];
}
