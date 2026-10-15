import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { PlatformAdminGuard } from '@plexo/auth';
import { LongRunningTransaction } from '@plexo/database';
import { ArcaConstanciaLinkService } from '../arca-padron/arca-constancia-link.service.js';
import { UpdateConstanciaLinkDto } from './dto/update-constancia-link.dto.js';

// Enlace a la consulta pública de la constancia de ARCA - ver ArcaConstanciaLinkService.
@Controller('admin/arca-constancia-link')
@UseGuards(PlatformAdminGuard)
export class AdminArcaConstanciaLinkController {
  constructor(private readonly link: ArcaConstanciaLinkService) {}

  @Get()
  getStatus() {
    return this.link.getStatus();
  }

  // Guarda y verifica (abre la página de ARCA: puede tardar unos segundos).
  @LongRunningTransaction(45_000)
  @Put()
  setUrl(@Body() dto: UpdateConstanciaLinkDto) {
    return this.link.setUrl(dto.url);
  }

  @LongRunningTransaction(45_000)
  @Post('verify')
  verify() {
    return this.link.verify();
  }
}
