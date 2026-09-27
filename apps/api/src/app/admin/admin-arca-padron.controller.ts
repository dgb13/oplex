import { BadRequestException, Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ArcaPadronService } from '@plexo/afip-credentials';
import { PlatformAdminGuard } from '@plexo/auth';
import { LongRunningTransaction } from '@plexo/database';
import { TestArcaPadronDto } from './dto/test-arca-padron.dto.js';
import { UploadArcaPadronCertificateDto } from './dto/upload-arca-padron-certificate.dto.js';

// Padrón de ARCA con el certificado de Oplex (autocompletar por CUIT en
// toda la plataforma) - ver ArcaPadronService.
@Controller('admin/arca-padron')
@UseGuards(PlatformAdminGuard)
export class AdminArcaPadronController {
  constructor(private readonly arcaPadron: ArcaPadronService) {}

  @Get()
  getStatus() {
    return this.arcaPadron.getStatus();
  }

  // WSAA + padrón pueden tardar varios segundos.
  @LongRunningTransaction(45_000)
  @Post('test')
  test(@Body() dto: TestArcaPadronDto) {
    return this.arcaPadron.test(dto.cuit);
  }

  @Post('certificate')
  async uploadCertificate(@Body() dto: UploadArcaPadronCertificateDto) {
    try {
      return await this.arcaPadron.uploadCertificate(dto.certPem, dto.keyPem);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }
}
