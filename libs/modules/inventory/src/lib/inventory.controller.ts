import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  StreamableFile,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import '@fastify/multipart';
import { Roles } from '@plexo/auth';
import { AuditEntity } from '@plexo/database';
import { ArticleAttachmentsService } from './article-attachments.service.js';
import { ArticleImageService } from './article-image.service.js';
import { ArticleImportService } from './article-import.service.js';
import { CreateArticleDto } from './dto/create-article.dto.js';
import { UpdateArticleDto } from './dto/update-article.dto.js';
import { CreateArticleVariantDto } from './dto/create-article-variant.dto.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { CreateWarehouseDto } from './dto/create-warehouse.dto.js';
import { RecordStockMovementDto } from './dto/record-stock-movement.dto.js';
import { SetMinimumStockDto } from './dto/set-minimum-stock.dto.js';
import { InventoryService } from './inventory.service.js';

const WRITE_ROLES = ['OWNER', 'ADMIN', 'INVENTORY'] as const;

import { ImportOptionsDto } from './dto/import-options.dto.js';
@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly articleImportService: ArticleImportService,
    private readonly articleImageService: ArticleImageService,
    private readonly articleAttachmentsService: ArticleAttachmentsService,
  ) {}

  @Roles(...WRITE_ROLES)
  @Post('warehouses')
  createWarehouse(@Body() dto: CreateWarehouseDto) {
    return this.inventoryService.createWarehouse(dto);
  }

  @Get('warehouses')
  listWarehouses() {
    return this.inventoryService.listWarehouses();
  }

  // Alícuotas vigentes para el campo "IVA del artículo" - acá y no en
  // /taxes/definitions porque esa ruta pide acceso al módulo Impuestos y
  // quien carga artículos no necesariamente lo tiene.
  @Get('tax-options')
  listTaxOptions() {
    return this.inventoryService.listTaxOptions();
  }

  @Roles(...WRITE_ROLES)
  @Post('categories')
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.inventoryService.createCategory(dto);
  }

  @Get('categories')
  listCategories() {
    return this.inventoryService.listCategories();
  }

  @Roles(...WRITE_ROLES)
  @Post('articles')
  createArticle(@Body() dto: CreateArticleDto) {
    return this.inventoryService.createArticle(dto);
  }

  @Get('articles')
  listArticles(
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('isPublished') isPublished?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.inventoryService.listArticles({
      search,
      categoryId,
      isPublished: isPublished === undefined ? undefined : isPublished === 'true',
      includeInactive: includeInactive === 'true',
    });
  }

  @AuditEntity('article', { labelFields: ['name'] })
  @Roles(...WRITE_ROLES)
  @Patch('articles/:id')
  updateArticle(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateArticleDto) {
    return this.inventoryService.updateArticle(id, dto);
  }

  // Vacío = la unidad de medida se puede cambiar - ver
  // InventoryService.getUnitOfMeasureLockReasons.
  @Get('articles/:id/unit-of-measure-lock')
  async getUnitOfMeasureLock(@Param('id', ParseUUIDPipe) id: string) {
    return { reasons: await this.inventoryService.getUnitOfMeasureLockReasons(id) };
  }

  @Roles(...WRITE_ROLES)
  @Get('articles/import/template')
  async downloadImportTemplate() {
    return new StreamableFile(await this.articleImportService.generateTemplate(), {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="plantilla-articulos.xlsx"',
    });
  }

  @Get('articles/export')
  async exportArticles() {
    return new StreamableFile(await this.articleImportService.exportArticles(), {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="articulos.xlsx"',
    });
  }

  /** Paso 1 del importador: sube el archivo y devuelve sus columnas. */
  @Roles(...WRITE_ROLES)
  @Post('articles/import')
  async analyzeImport(@Req() req: FastifyRequest) {
    const data = await req.file();
    if (!data) {
      throw new BadRequestException('No se recibió ningún archivo');
    }
    return this.articleImportService.analyze(data.filename, await data.toBuffer());
  }

  @Roles(...WRITE_ROLES)
  @Post('articles/import/:id/preview')
  previewImport(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ImportOptionsDto) {
    return this.articleImportService.preview(id, dto);
  }

  @Roles(...WRITE_ROLES)
  @Post('articles/import/:id/suggest-categories')
  suggestImportCategories(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ImportOptionsDto) {
    return this.articleImportService.suggestCategories(id, dto);
  }

  @Roles(...WRITE_ROLES)
  @Post('articles/import/:id/start')
  startImport(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ImportOptionsDto) {
    return this.articleImportService.start(id, dto);
  }

  @Roles(...WRITE_ROLES)
  @Get('articles/import/:id/status')
  importStatus(@Param('id', ParseUUIDPipe) id: string) {
    return this.articleImportService.status(id);
  }

  /** Filas con error en Excel. Antes de importar, con las opciones elegidas. */
  @Roles(...WRITE_ROLES)
  @Post('articles/import/:id/errors')
  async importErrors(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ImportOptionsDto) {
    return new StreamableFile(await this.articleImportService.errorsWorkbook(id, dto), {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="articulos-con-error.xlsx"',
    });
  }

  @Roles(...WRITE_ROLES)
  @Post('article-variants')
  createArticleVariant(@Body() dto: CreateArticleVariantDto) {
    return this.inventoryService.createArticleVariant(dto);
  }

  @Roles(...WRITE_ROLES)
  @Patch('article-variants/:id/price')
  updatePrice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('unitPrice') unitPrice: number,
  ) {
    return this.inventoryService.updateArticleVariantPrice(id, unitPrice);
  }

  @Get('article-variants/:id/stock')
  async getConsolidatedStock(@Param('id', ParseUUIDPipe) id: string) {
    const quantity = await this.inventoryService.getConsolidatedStock(id);
    return { articleVariantId: id, quantity };
  }

  @Get('article-variants/:id/price-history')
  getPriceHistory(@Param('id', ParseUUIDPipe) id: string) {
    return this.inventoryService.getPriceHistory(id);
  }

  @Roles(...WRITE_ROLES)
  @Post('minimum-stock')
  setMinimumStock(@Body() dto: SetMinimumStockDto) {
    return this.inventoryService.setMinimumStock(dto);
  }

  // purchaseOrderId/goodsReceiptLineId are only ever set by
  // GoodsReceiptsService (apps/api), which calls InventoryService.
  // recordMovement() directly in-process - never through this HTTP
  // endpoint, so ValidationPipe never runs on that internal call. This
  // is the only place a caller (the frontend's "Nuevo movimiento" modal,
  // or any other API client) could otherwise link a manual movement to a
  // real Orden de Compra with none of GoodsReceiptService's validation
  // (quantity capped at what's pending, cost read from the order's own
  // line, entregas parciales acumuladas) - closing exactly the gap this
  // was built to fix, not just hiding it in the UI. See PROGRESS.md.
  //
  // LINEAL_1D (barras/recortes) se bloquea del mismo modo, pero el check en
  // sí vive en InventoryService.recordMovement (necesita leer el
  // measurementType del artículo, y ese service es el único que ya toca la
  // DB acá - ver el comentario ahí para el motivo completo). Este método
  // se queda sync/sin DB a propósito, mismo shape que ya cubre
  // inventory.controller.spec.ts - sólo pasa el flag que activa ese check.
  @Roles(...WRITE_ROLES)
  @Post('movements')
  recordMovement(@Body() dto: RecordStockMovementDto) {
    if (dto.purchaseOrderId || dto.goodsReceiptLineId) {
      throw new BadRequestException(
        'Para recibir mercadería contra una Orden de Compra, usá "Recibir mercadería" desde Compras - no este movimiento manual.',
      );
    }
    return this.inventoryService.recordMovement(dto, { blockManualLineal1D: true });
  }

  @Get('reorder-suggestions')
  listReorderSuggestions() {
    return this.inventoryService.listReorderSuggestions();
  }

  @Get('stock-value-by-category')
  getStockValueByCategory() {
    return this.inventoryService.getStockValueByCategory();
  }

  @AuditEntity('article', { labelFields: ['name'] })
  @Roles(...WRITE_ROLES)
  @Post('articles/:id/image')
  async uploadArticleImage(@Param('id', ParseUUIDPipe) id: string, @Req() req: FastifyRequest) {
    const data = await req.file();
    if (!data) {
      throw new BadRequestException('No se recibió ningún archivo');
    }
    const buffer = await data.toBuffer();
    return this.articleImageService.setImage(id, data.mimetype, buffer);
  }

  @AuditEntity('article', { labelFields: ['name'] })
  @Roles(...WRITE_ROLES)
  @Delete('articles/:id/image')
  removeArticleImage(@Param('id', ParseUUIDPipe) id: string) {
    return this.articleImageService.removeImage(id);
  }

  @AuditEntity('article', { labelFields: ['name'] })
  @Roles(...WRITE_ROLES)
  @Post('articles/:id/brochure')
  async uploadArticleBrochure(@Param('id', ParseUUIDPipe) id: string, @Req() req: FastifyRequest) {
    const data = await req.file();
    if (!data) {
      throw new BadRequestException('No se recibió ningún archivo');
    }
    const buffer = await data.toBuffer();
    return this.articleAttachmentsService.setBrochure(id, data.mimetype, buffer);
  }

  @AuditEntity('article', { labelFields: ['name'] })
  @Roles(...WRITE_ROLES)
  @Delete('articles/:id/brochure')
  removeArticleBrochure(@Param('id', ParseUUIDPipe) id: string) {
    return this.articleAttachmentsService.removeBrochure(id);
  }

  @AuditEntity('article', { labelFields: ['name'] })
  @Roles(...WRITE_ROLES)
  @Post('articles/:id/attachment-zip')
  async uploadArticleAttachmentZip(@Param('id', ParseUUIDPipe) id: string, @Req() req: FastifyRequest) {
    const data = await req.file();
    if (!data) {
      throw new BadRequestException('No se recibió ningún archivo');
    }
    const buffer = await data.toBuffer();
    return this.articleAttachmentsService.setAttachmentZip(id, data.mimetype, data.filename, buffer);
  }

  @AuditEntity('article', { labelFields: ['name'] })
  @Roles(...WRITE_ROLES)
  @Delete('articles/:id/attachment-zip')
  removeArticleAttachmentZip(@Param('id', ParseUUIDPipe) id: string) {
    return this.articleAttachmentsService.removeAttachmentZip(id);
  }
}
