import { BadRequestException, Injectable } from '@nestjs/common';
import { getTenantDb, getTenantId, Prisma, type StockPiece } from '@plexo/database';

export interface CutResult {
  consumedFrom: StockPiece;
  // La pieza nueva creada para el remanente - null si el corte agotó la
  // pieza exacto (remainder = 0). Puede tener status SCRAP si el remanente
  // quedó por debajo de minUsableLength - igual se crea la fila (no se
  // pierde trazabilidad de la merma), sólo no vuelve a ofrecerse en
  // findBestFitPiece.
}

/**
 * Piezas físicas 1D (ver docs/OPLEX-Produccion-Plan-Tecnico-14-9.md, Fase
 * 4.2/4.3 y el flujo "cable canal" del diseño, §4). Cada corte NO achica la
 * fila existente in-place: la retira (DEPLETED) y crea una pieza HIJA
 * nueva para el remanente, encadenada por `parentPieceId` - así se
 * reproduce "2000 -> 1100 -> 600" como una cadena trazable de piezas, no
 * un solo número que va bajando. El costo por mm se hereda tal cual de
 * padre a hijo (nunca se recalcula, mismo criterio "congelado" que
 * StockMovement.unitCost).
 */
@Injectable()
export class StockPieceService {
  createFullStockPiece(input: {
    articleVariantId: string;
    warehouseId: string;
    length: number | Prisma.Decimal;
    unitCost: number | Prisma.Decimal;
  }): Promise<StockPiece> {
    const length = new Prisma.Decimal(input.length);
    return getTenantDb().stockPiece.create({
      data: {
        tenantId: getTenantId(),
        articleVariantId: input.articleVariantId,
        warehouseId: input.warehouseId,
        originalLength: length,
        currentLength: length,
        status: 'AVAILABLE',
        sourceType: 'FULL_STOCK',
        unitCost: new Prisma.Decimal(input.unitCost),
      },
    });
  }

  /**
   * Reversa de createFullStockPiece - usada por SupplierReturnsService
   * (apps/api) cuando se devuelven barras/rollos enteros al proveedor.
   * Sólo puede devolver piezas TODAVÍA INTACTAS (currentLength ==
   * originalLength, nunca cortadas) - una barra ya cortada no es "la misma
   * barra" que se recibió, físicamente no hay nada entero para devolver.
   * Las más nuevas primero (LIFO): una devolución normalmente ocurre poco
   * después de la recepción que la originó, así que son las que con más
   * probabilidad siguen intactas y es menos probable que ya se haya
   * planificado producción sobre una pieza más vieja. Igual que cutPiece,
   * nunca hace hard-delete - las marca DEPLETED (mismo estado que "ya se
   * consumió", no hay un estado separado para "devuelta"; la traza de la
   * propia SupplierReturn en Compras es lo que documenta el motivo).
   * Explota (no devuelve parcial) si no hay `count` piezas intactas - mejor
   * que dejar el conteo silenciosamente descuadrado contra lo que el
   * usuario pidió devolver.
   */
  async returnFullPieces(input: {
    articleVariantId: string;
    warehouseId: string;
    count: number;
    // Sólo piezas que nacieron con este largo (mm) - el caller pasa el de
    // la recepción que se está devolviendo, por si el largo comercial del
    // artículo cambió desde entonces. Omitido = cualquier largo.
    length?: number | Prisma.Decimal;
  }): Promise<StockPiece[]> {
    const db = getTenantDb();
    const pieces = await db.stockPiece.findMany({
      where: {
        articleVariantId: input.articleVariantId,
        warehouseId: input.warehouseId,
        status: 'AVAILABLE',
        sourceType: 'FULL_STOCK',
        originalLength: input.length === undefined ? undefined : new Prisma.Decimal(input.length),
      },
      orderBy: { createdAt: 'desc' },
    });
    const intact = pieces.filter((p) => p.currentLength.equals(p.originalLength));
    if (intact.length < input.count) {
      throw new BadRequestException(
        `Sólo hay ${intact.length} pieza(s) entera(s) sin cortar disponibles para devolver - se pidieron ${input.count}.`,
      );
    }
    const toReturn = intact.slice(0, input.count);
    await db.stockPiece.updateMany({
      where: { id: { in: toReturn.map((p) => p.id) } },
      data: { status: 'DEPLETED', currentLength: 0 },
    });
    return toReturn;
  }

  /** La pieza AVAILABLE más chica donde entra el corte pedido - "el
   * sistema sugiere el recorte óptimo" del diseño (§1). El operario puede
   * cambiarla manualmente (llamando cutPiece con otro pieceId), esto es
   * sólo la sugerencia. */
  findBestFitPiece(input: {
    articleVariantId: string;
    warehouseId: string;
    minLength: number | Prisma.Decimal;
  }): Promise<StockPiece | null> {
    return getTenantDb().stockPiece.findFirst({
      where: {
        articleVariantId: input.articleVariantId,
        warehouseId: input.warehouseId,
        status: 'AVAILABLE',
        currentLength: { gte: new Prisma.Decimal(input.minLength) },
      },
      orderBy: { currentLength: 'asc' },
    });
  }

  /** La pieza AVAILABLE más larga - fallback para cuando ningún caño/perfil
   * individual alcanza para cubrir todo lo que falta consumir de un tirón
   * (ver ProductionService.completeOrder, apps/api): se agota esa pieza
   * entera y se sigue con el resto en otra(s) pieza(s). */
  findLargestPiece(input: { articleVariantId: string; warehouseId: string }): Promise<StockPiece | null> {
    return getTenantDb().stockPiece.findFirst({
      where: {
        articleVariantId: input.articleVariantId,
        warehouseId: input.warehouseId,
        status: 'AVAILABLE',
      },
      orderBy: { currentLength: 'desc' },
    });
  }

  /** Suma de currentLength de las piezas AVAILABLE de un artículo - el
   * "físico total" 1D que usa ProductionPlanningService.getDisponible. */
  async getAvailableLength(input: { articleVariantId: string; warehouseId: string }): Promise<Prisma.Decimal> {
    const result = await getTenantDb().stockPiece.aggregate({
      where: { articleVariantId: input.articleVariantId, warehouseId: input.warehouseId, status: 'AVAILABLE' },
      _sum: { currentLength: true },
    });
    return result._sum.currentLength ?? new Prisma.Decimal(0);
  }

  /** Todas las piezas de un artículo 1D (AVAILABLE/DEPLETED/SCRAP, no sólo
   * las disponibles como findBestFitPiece/findLargestPiece/
   * getAvailableLength de arriba) - el historial completo de cortes es el
   * punto de la pantalla "Piezas / recortes" (Fase 6, UI). */
  listByArticleVariant(input: {
    articleVariantId: string;
    warehouseId?: string;
  }): Promise<StockPiece[]> {
    return getTenantDb().stockPiece.findMany({
      where: { articleVariantId: input.articleVariantId, warehouseId: input.warehouseId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Corta `lengthToCut` de una pieza: la retira (DEPLETED) y, si sobra
   * remanente, crea la pieza hija (AVAILABLE si remainder >=
   * minUsableLength, SCRAP si no - minUsableLength lo resuelve el caller,
   * que ya conoce el Article, para no volver a consultarlo acá).
   */
  async cutPiece(input: {
    pieceId: string;
    lengthToCut: number | Prisma.Decimal;
    minUsableLength: number | Prisma.Decimal | null;
  }): Promise<CutResult & { offcut: StockPiece | null }> {
    const db = getTenantDb();
    const tenantId = getTenantId();
    const lengthToCut = new Prisma.Decimal(input.lengthToCut);

    // Lock primero - dos consumos concurrentes de la misma pieza no deben
    // poder cortarla dos veces en paralelo, mismo patrón ya establecido
    // (InvoicingService.createCreditNote, GoodsReceiptService.create).
    await db.$queryRaw`SELECT id FROM stock_pieces WHERE id = ${input.pieceId} FOR UPDATE`;
    const piece = await db.stockPiece.findUnique({ where: { id: input.pieceId } });
    if (!piece) {
      throw new BadRequestException('Pieza de stock no encontrada');
    }
    if (piece.status !== 'AVAILABLE') {
      throw new BadRequestException('Esta pieza no está disponible');
    }
    if (piece.currentLength.lt(lengthToCut)) {
      throw new BadRequestException('Esta pieza es más corta que el corte solicitado');
    }

    const remainder = piece.currentLength.sub(lengthToCut);
    const consumedFrom = await db.stockPiece.update({
      where: { id: piece.id },
      data: { status: 'DEPLETED', currentLength: 0 },
    });

    if (remainder.lte(0)) {
      return { consumedFrom, offcut: null };
    }

    const minUsableLength =
      input.minUsableLength == null ? null : new Prisma.Decimal(input.minUsableLength);
    const offcut = await db.stockPiece.create({
      data: {
        tenantId,
        articleVariantId: piece.articleVariantId,
        warehouseId: piece.warehouseId,
        originalLength: remainder,
        currentLength: remainder,
        status: minUsableLength !== null && remainder.gte(minUsableLength) ? 'AVAILABLE' : 'SCRAP',
        sourceType: 'OFFCUT',
        parentPieceId: piece.id,
        // El costo por mm no cambia porque se cortó - se hereda tal cual.
        unitCost: piece.unitCost,
      },
    });

    return { consumedFrom, offcut };
  }
}
