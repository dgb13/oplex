import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  StreamableFile,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import '@fastify/multipart';
import { Roles } from '@plexo/auth';
import { COMPANY_WRITE_ROLES } from '../company-permissions.js';
import { CompanyImportOptionsDto } from '../dto/company-import-options.dto.js';
import { CompanyImportService, type CompanyImportRole } from './company-import.service.js';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Importador de proveedores y clientes (ver CompanyImportService). La regla
 * fina por tipo (proveedores Compras, clientes Ventas) la aplica el servicio. */
@Roles(...COMPANY_WRITE_ROLES)
@Controller('companies/import')
export class CompanyImportController {
  constructor(private readonly companyImportService: CompanyImportService) {}

  @Get('template')
  async template() {
    return new StreamableFile(await this.companyImportService.generateTemplate(), {
      type: XLSX,
      disposition: 'attachment; filename="plantilla-empresas.xlsx"',
    });
  }

  @Get('export')
  async export(@Query('role') role?: string) {
    const which: CompanyImportRole | undefined = role === 'CUSTOMER' || role === 'SUPPLIER' ? role : undefined;
    const name = which === 'CUSTOMER' ? 'clientes' : which === 'SUPPLIER' ? 'proveedores' : 'empresas';
    return new StreamableFile(await this.companyImportService.exportCompanies(which), {
      type: XLSX,
      disposition: `attachment; filename="${name}.xlsx"`,
    });
  }

  /** Paso 1: sube el archivo y devuelve sus columnas. */
  @Post()
  async analyze(@Req() req: FastifyRequest) {
    const data = await req.file();
    if (!data) {
      throw new BadRequestException('No se recibió ningún archivo');
    }
    return this.companyImportService.analyze(data.filename, await data.toBuffer());
  }

  @Post(':id/preview')
  preview(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CompanyImportOptionsDto) {
    return this.companyImportService.preview(id, dto);
  }

  @Post(':id/start')
  start(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CompanyImportOptionsDto) {
    return this.companyImportService.start(id, dto);
  }

  @Get(':id/status')
  status(@Param('id', ParseUUIDPipe) id: string) {
    return this.companyImportService.status(id);
  }

  @Post(':id/errors')
  async errors(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CompanyImportOptionsDto) {
    return new StreamableFile(await this.companyImportService.errorsWorkbook(id, dto), {
      type: XLSX,
      disposition: 'attachment; filename="empresas-con-error.xlsx"',
    });
  }
}
