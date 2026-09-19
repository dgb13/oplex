import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { getTenantDb, getTenantId, type BillOfMaterials, type BomByproduct, type BomLine } from '@plexo/database';
import type { CreateBomDto } from './dto/create-bom.dto.js';

export type BomDetail = BillOfMaterials & { lines: BomLine[]; byproducts: BomByproduct[] };

const DETAIL_INCLUDE = { lines: true, byproducts: true } as const;

/**
 * Recetas versionadas (ver docs/OPLEX-Produccion-Plan-Tecnico-14-9.md, Fase
 * 4.4) - editar una receta activa nunca la pisa: crea una fila nueva
 * (version = anterior+1, isActive=true) y desactiva la vieja, mismo
 * criterio "append-only" que PriceHistory/ExchangeRateHistory. Sólo una
 * versión activa por producto a la vez (mantenido a mano, Prisma no tiene
 * @@unique parcial nativo).
 */
@Injectable()
export class BomService {
  async create(dto: CreateBomDto): Promise<BomDetail> {
    const db = getTenantDb();
    const tenantId = getTenantId();

    // La suma de costSharePercent de todos los subproductos más el
    // remanente implícito del producto principal debe dar 100% - acá sólo
    // se valida que los subproductos por sí solos no superen ese techo (el
    // remanente para el principal se calcula solo, nunca puede ser
    // negativo si esto se cumple).
    const totalByproductShare = (dto.byproducts ?? []).reduce(
      (sum, b) => sum + (b.costSharePercent ?? 0),
      0,
    );
    if (totalByproductShare > 100) {
      throw new BadRequestException(
        `La suma de costSharePercent de los subproductos (${totalByproductShare}) no puede superar 100`,
      );
    }

    // Lock primero, mismo motivo que InvoicingService.createCreditNote /
    // GoodsReceiptService.create: dos altas de receta concurrentes para el
    // mismo artículo no deben poder desactivar/crear en paralelo y terminar
    // con dos versiones "activas" a la vez.
    await db.$queryRaw`
      SELECT id FROM bill_of_materials
      WHERE "outputArticleVariantId" = ${dto.outputArticleVariantId} AND "isActive" = true
      FOR UPDATE
    `;
    const previousActive = await db.billOfMaterials.findFirst({
      where: { tenantId, outputArticleVariantId: dto.outputArticleVariantId, isActive: true },
    });
    if (previousActive) {
      await db.billOfMaterials.update({ where: { id: previousActive.id }, data: { isActive: false } });
    }

    const bom = await db.billOfMaterials.create({
      data: {
        tenantId,
        outputArticleVariantId: dto.outputArticleVariantId,
        name: dto.name,
        version: (previousActive?.version ?? 0) + 1,
        isActive: true,
        lines: { createMany: { data: dto.lines.map((line) => ({ tenantId, ...line })) } },
        byproducts: dto.byproducts?.length
          ? { createMany: { data: dto.byproducts.map((byproduct) => ({ tenantId, ...byproduct })) } }
          : undefined,
      },
      include: DETAIL_INCLUDE,
    });

    // Marca el producto como "se fabrica" solo, aunque quien lo creó se haya
    // olvidado de tildar el checkbox al alta del artículo (ver
    // ArticleFormModal/isManufactured) - una receta real es la prueba más
    // fuerte posible de que esto se fabrica. updateMany + isManufactured:
    // false en el where evita un write de más en el caso común de una
    // nueva versión sobre un producto que ya lo tenía.
    const { articleId } = await db.articleVariant.findUniqueOrThrow({
      where: { id: dto.outputArticleVariantId },
      select: { articleId: true },
    });
    await db.article.updateMany({
      where: { id: articleId, isManufactured: false },
      data: { isManufactured: true },
    });

    return bom;
  }

  async getActiveBom(outputArticleVariantId: string): Promise<BomDetail | null> {
    return getTenantDb().billOfMaterials.findFirst({
      where: { outputArticleVariantId, isActive: true },
      include: DETAIL_INCLUDE,
    });
  }

  async getActiveBomOrThrow(outputArticleVariantId: string): Promise<BomDetail> {
    const bom = await this.getActiveBom(outputArticleVariantId);
    if (!bom) {
      throw new NotFoundException('Este artículo no tiene una receta (BOM) activa');
    }
    return bom;
  }

  listVersions(outputArticleVariantId: string): Promise<BillOfMaterials[]> {
    return getTenantDb().billOfMaterials.findMany({
      where: { outputArticleVariantId },
      orderBy: { version: 'desc' },
    });
  }

  /** Una versión puntual (no necesariamente la activa) - usado por
   * ProductionOrderService.confirm para leer las líneas de la receta que
   * quedó congelada (bomId/bomVersion) en la orden, aunque la receta ya
   * haya sido reemplazada por una versión más nueva desde entonces. */
  async getById(bomId: string): Promise<BomDetail> {
    const bom = await getTenantDb().billOfMaterials.findUnique({
      where: { id: bomId },
      include: DETAIL_INCLUDE,
    });
    if (!bom) {
      throw new NotFoundException('Receta (BOM) no encontrada');
    }
    return bom;
  }
}
