import { Prisma } from '@plexo/database';

/**
 * "Disponible = físico - reservado" (ver
 * docs/OPLEX-Produccion-Plan-Tecnico-14-9.md, Fase 2/4.6) - un único lugar
 * para sumar reservas `ACTIVE`, reusado por `InventoryService.recordMovement`
 * (bajo el lock de la fila de `StockLedger`, para el chequeo de salida) y
 * por `ProductionPlanningService.computeProducible` (lectura exploratoria,
 * sin lock) en `@plexo/production` - así nunca divergen en qué cuenta como
 * "reservado". Exportada desde el índice público del módulo (no un
 * `Service` de Nest, un named export común y corriente, mismo criterio ya
 * usado para `computeStockDelta`) porque un lib module puede importar
 * funciones puras/DB de otro módulo, sólo no puede inyectar su `Service`.
 */
export async function getReservedQuantity(
  db: Prisma.TransactionClient,
  input: {
    warehouseId: string;
    articleVariantId: string;
    // La reserva que ProductionService.consumeReservation está consumiendo
    // en este mismo instante - sigue ACTIVE hasta después de este chequeo
    // (recordConsumption recién la pasa a CONSUMED al final, porque
    // necesita el unitCost que este mismo movimiento calcula). Sin excluirla
    // acá, "disponible" le restaba a la orden su propia reserva ENCIMA de
    // sacarle el stock físico, y completar cualquier orden que reservó más
    // de la mitad de lo libre tiraba "Insufficient available stock" en
    // falso (bug real encontrado probando el módulo en vivo, ver
    // InventoryService.recordMovement y ProductionService.consumeReservation).
    excludeReservationId?: string;
  },
): Promise<Prisma.Decimal> {
  const result = await db.stockReservation.aggregate({
    where: {
      warehouseId: input.warehouseId,
      inputArticleVariantId: input.articleVariantId,
      status: 'ACTIVE',
      ...(input.excludeReservationId ? { id: { not: input.excludeReservationId } } : {}),
    },
    _sum: { quantityReserved: true },
  });
  return result._sum.quantityReserved ?? new Prisma.Decimal(0);
}
