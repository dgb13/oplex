import { Body, Controller, Get, Param, Post, Query, Res, StreamableFile } from '@nestjs/common';
import { RequireModuleAccess } from '@plexo/auth';
import type { TaxDeadlineStatus, WithholdingTaxType } from '@plexo/database';
import { CreateTaxDeadlineDto } from './dto/create-tax-deadline.dto.js';
import { CreateTaxDefinitionDto } from './dto/create-tax-definition.dto.js';
import { CreateWithholdingRegimeDto } from './dto/create-withholding-regime.dto.js';
import { ReviseTaxDefinitionDto } from './dto/revise-tax-definition.dto.js';
import { ReviseWithholdingRegimeDto } from './dto/revise-withholding-regime.dto.js';
import { VatBookQueryDto } from './dto/vat-book-query.dto.js';
import { TaxDeadlineService } from './tax-deadline.service.js';
import { TaxesService } from './taxes.service.js';
import { CitiExportService } from './vat-book/citi/citi-export.service.js';
import { VatBookExcelService } from './vat-book/vat-book-excel.service.js';
import { VatBookPdfService } from './vat-book/pdf/vat-book-pdf.service.js';
import { VatBookService } from './vat-book/vat-book.service.js';
import { WithholdingRegimeService } from './withholding-regime.service.js';

const MODULE = 'taxes';

/** Sólo el método que necesitamos del reply de Fastify - evitar importar
 * el paquete `fastify` acá sólo por el tipo (esta lib no depende de un
 * framework HTTP en ningún otro lado). */
interface HeaderSettableReply {
  header(name: string, value: string): void;
}

@Controller('taxes')
export class TaxesController {
  constructor(
    private readonly taxesService: TaxesService,
    private readonly withholdingRegimeService: WithholdingRegimeService,
    private readonly vatBookService: VatBookService,
    private readonly vatBookExcelService: VatBookExcelService,
    private readonly vatBookPdfService: VatBookPdfService,
    private readonly citiExportService: CitiExportService,
    private readonly taxDeadlineService: TaxDeadlineService,
  ) {}

  @RequireModuleAccess(MODULE, 'write')
  @Post('definitions')
  createTaxDefinition(@Body() dto: CreateTaxDefinitionDto) {
    return this.taxesService.createTaxDefinition(dto);
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('definitions')
  listTaxDefinitions() {
    return this.taxesService.listTaxDefinitions();
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('definitions/active')
  listActiveTaxDefinitions() {
    return this.taxesService.listActiveTaxDefinitions();
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('definitions/:code/history')
  getTaxDefinitionHistory(@Param('code') code: string) {
    return this.taxesService.getTaxDefinitionHistory(code);
  }

  @RequireModuleAccess(MODULE, 'write')
  @Post('definitions/revise')
  reviseTaxDefinition(@Body() dto: ReviseTaxDefinitionDto) {
    return this.taxesService.reviseTaxDefinition(dto);
  }

  @RequireModuleAccess(MODULE, 'write')
  @Post('withholding-regimes')
  createWithholdingRegime(@Body() dto: CreateWithholdingRegimeDto) {
    return this.withholdingRegimeService.createRegime(dto);
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('withholding-regimes')
  listWithholdingRegimes() {
    return this.withholdingRegimeService.listRegimes();
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('withholding-regimes/active')
  listActiveWithholdingRegimes(@Query('taxType') taxType?: WithholdingTaxType) {
    return this.withholdingRegimeService.listActiveRegimes(taxType);
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('withholding-regimes/:code/history')
  getWithholdingRegimeHistory(@Param('code') code: string) {
    return this.withholdingRegimeService.getRegimeHistory(code);
  }

  @RequireModuleAccess(MODULE, 'write')
  @Post('withholding-regimes/revise')
  reviseWithholdingRegime(@Body() dto: ReviseWithholdingRegimeDto) {
    return this.withholdingRegimeService.reviseRegime(dto);
  }

  // --- Libro IVA Ventas / Compras ---

  @RequireModuleAccess(MODULE, 'read')
  @Get('vat-book/sales')
  getSalesVatBook(@Query() query: VatBookQueryDto) {
    return this.vatBookService.getSalesBook(query.from, query.to);
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('vat-book/purchases')
  getPurchasesVatBook(@Query() query: VatBookQueryDto) {
    return this.vatBookService.getPurchasesBook(query.from, query.to);
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('vat-book/sales/excel')
  async downloadSalesVatBookExcel(@Query() query: VatBookQueryDto) {
    const result = await this.vatBookService.getSalesBook(query.from, query.to);
    const buffer = await this.vatBookExcelService.generate(result);
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="libro-iva-ventas_${result.from}_${result.to}.xlsx"`,
    });
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('vat-book/purchases/excel')
  async downloadPurchasesVatBookExcel(@Query() query: VatBookQueryDto) {
    const result = await this.vatBookService.getPurchasesBook(query.from, query.to);
    const buffer = await this.vatBookExcelService.generate(result);
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="libro-iva-compras_${result.from}_${result.to}.xlsx"`,
    });
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('vat-book/sales/pdf')
  async downloadSalesVatBookPdf(@Query() query: VatBookQueryDto) {
    const result = await this.vatBookService.getSalesBook(query.from, query.to);
    const { buffer, filename } = await this.vatBookPdfService.generate(result);
    return new StreamableFile(buffer, { type: 'application/pdf', disposition: `attachment; filename="${filename}"` });
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('vat-book/purchases/pdf')
  async downloadPurchasesVatBookPdf(@Query() query: VatBookQueryDto) {
    const result = await this.vatBookService.getPurchasesBook(query.from, query.to);
    const { buffer, filename } = await this.vatBookPdfService.generate(result);
    return new StreamableFile(buffer, { type: 'application/pdf', disposition: `attachment; filename="${filename}"` });
  }

  // --- Libro de IVA Digital (RG 4597 / ARCA) - archivos de ancho fijo ---
  // Encoding ANSI/ISO-8859-1 (Windows-1252) por especificación de ARCA,
  // no UTF-8 - ver CitiExportService.

  @RequireModuleAccess(MODULE, 'read')
  @Get('vat-book/sales/citi/cbte')
  async downloadVentasCbte(@Query() query: VatBookQueryDto) {
    const { content } = await this.citiExportService.getVentasCbte(query.from, query.to);
    return new StreamableFile(Buffer.from(content, 'latin1'), {
      type: 'text/plain',
      disposition: 'attachment; filename="LIBRO_IVA_DIGITAL_VENTAS_CBTE.txt"',
    });
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('vat-book/sales/citi/alicuotas')
  async downloadVentasAlicuotas(@Query() query: VatBookQueryDto) {
    const { content } = await this.citiExportService.getVentasAlicuotas(query.from, query.to);
    return new StreamableFile(Buffer.from(content, 'latin1'), {
      type: 'text/plain',
      disposition: 'attachment; filename="LIBRO_IVA_DIGITAL_VENTAS_ALICUOTAS.txt"',
    });
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('vat-book/purchases/citi/cbte')
  async downloadComprasCbte(@Query() query: VatBookQueryDto, @Res({ passthrough: true }) res: HeaderSettableReply) {
    const { content, skippedCount } = await this.citiExportService.getComprasCbte(query.from, query.to);
    res.header('X-Skipped-Count', String(skippedCount));
    res.header('Access-Control-Expose-Headers', 'X-Skipped-Count');
    return new StreamableFile(Buffer.from(content, 'latin1'), {
      type: 'text/plain',
      disposition: 'attachment; filename="LIBRO_IVA_DIGITAL_COMPRAS_CBTE.txt"',
    });
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('vat-book/purchases/citi/alicuotas')
  async downloadComprasAlicuotas(@Query() query: VatBookQueryDto, @Res({ passthrough: true }) res: HeaderSettableReply) {
    const { content, skippedCount } = await this.citiExportService.getComprasAlicuotas(query.from, query.to);
    res.header('X-Skipped-Count', String(skippedCount));
    res.header('Access-Control-Expose-Headers', 'X-Skipped-Count');
    return new StreamableFile(Buffer.from(content, 'latin1'), {
      type: 'text/plain',
      disposition: 'attachment; filename="LIBRO_IVA_DIGITAL_COMPRAS_ALICUOTAS.txt"',
    });
  }

  // --- Vencimientos (carga manual, ver TaxDeadlineService) ---

  @RequireModuleAccess(MODULE, 'write')
  @Post('deadlines')
  createDeadline(@Body() dto: CreateTaxDeadlineDto) {
    return this.taxDeadlineService.create(dto);
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('deadlines')
  listDeadlines(@Query('status') status?: TaxDeadlineStatus) {
    return this.taxDeadlineService.list(status);
  }

  @RequireModuleAccess(MODULE, 'write')
  @Post('deadlines/:id/done')
  markDeadlineDone(@Param('id') id: string) {
    return this.taxDeadlineService.markDone(id);
  }
}
