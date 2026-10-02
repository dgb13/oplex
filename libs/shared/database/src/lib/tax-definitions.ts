import type { Prisma, TaxDefinition } from '../generated/client.js';

/**
 * La versión de un impuesto vigente en `asOf`, a partir de la versión que
 * tiene guardada el artículo (Article.taxDefinitionId).
 *
 * Un TaxDefinition se versiona (TaxesService.reviseTaxDefinition cierra la
 * fila vigente y crea otra con el mismo code) pero el artículo queda atado a
 * la fila con la que se creó: sin esto, una revisión de alícuota no llegaba
 * nunca a los artículos existentes y se seguía facturando con la tasa vieja
 * (pasó con IVA21 21,00 → 21,50, 2026-10-02). Se busca por code; si no hay
 * ninguna versión vigente en `asOf` (p. ej. la única empieza en el futuro),
 * se usa la guardada, igual que antes.
 */
export async function resolveCurrentTaxDefinition(
  db: Prisma.TransactionClient,
  linked: TaxDefinition | null,
  asOf: Date = new Date(),
): Promise<TaxDefinition | null> {
  if (!linked) {
    return null;
  }
  const current = await db.taxDefinition.findFirst({
    where: activeWhere([linked.code], asOf),
    orderBy: { validFrom: 'desc' },
  });
  return current ?? linked;
}

/** Lo mismo para muchos artículos con una sola consulta: devuelve la
 * versión vigente por id de la versión guardada. */
export async function resolveCurrentTaxDefinitions(
  db: Prisma.TransactionClient,
  linked: (TaxDefinition | null)[],
  asOf: Date = new Date(),
): Promise<Map<string, TaxDefinition>> {
  const present = linked.filter((d): d is TaxDefinition => !!d);
  const result = new Map<string, TaxDefinition>();
  if (present.length === 0) {
    return result;
  }
  const codes = [...new Set(present.map((d) => d.code))];
  const active = await db.taxDefinition.findMany({
    where: activeWhere(codes, asOf),
    orderBy: { validFrom: 'desc' },
  });
  const byCode = new Map<string, TaxDefinition>();
  for (const definition of active) {
    if (!byCode.has(definition.code)) {
      byCode.set(definition.code, definition);
    }
  }
  for (const definition of present) {
    result.set(definition.id, byCode.get(definition.code) ?? definition);
  }
  return result;
}

function activeWhere(codes: string[], asOf: Date): Prisma.TaxDefinitionWhereInput {
  return {
    code: { in: codes },
    validFrom: { lte: asOf },
    OR: [{ validTo: null }, { validTo: { gt: asOf } }],
  };
}
