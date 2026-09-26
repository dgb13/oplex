import { Body, Controller, Delete, Get, Patch, Post } from '@nestjs/common';
import { Roles } from '@plexo/auth';
import { AuditEntity } from '@plexo/database';
import { RegisterDomainDto } from './dto/register-domain.dto.js';
import { UpdateTenantInfoDto } from './dto/update-tenant-info.dto.js';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto.js';
import { GenerateAfipCsrDto } from './dto/generate-afip-csr.dto.js';
import { InspectAfipFileDto } from './dto/inspect-afip-file.dto.js';
import { UploadAfipCertificateDto } from './dto/upload-afip-certificate.dto.js';
import { TenantSettingsService } from './tenant-settings.service.js';

// Tenant-wide business policy, not a personal preference like theme/density
// - restricted the same way other tenant-level config would be, matching
// the roles that can already create/edit Company records.
const WRITE_ROLES = ['OWNER', 'ADMIN'] as const;

@Controller('tenant-settings')
export class TenantSettingsController {
  constructor(private readonly tenantSettingsService: TenantSettingsService) {}

  @Get()
  getSettings() {
    return this.tenantSettingsService.getSettings();
  }

  @AuditEntity('tenantSettings', { idParam: null })
  @Roles(...WRITE_ROLES)
  @Patch()
  updateSettings(@Body() dto: UpdateTenantSettingsDto) {
    return this.tenantSettingsService.updateSettings(dto);
  }

  @Roles(...WRITE_ROLES)
  @Post('email-domain')
  registerDomain(@Body() dto: RegisterDomainDto) {
    return this.tenantSettingsService.registerCustomDomain(dto.domain);
  }

  @Roles(...WRITE_ROLES)
  @Post('email-domain/verify')
  verifyDomain() {
    return this.tenantSettingsService.refreshDomainStatus();
  }

  @AuditEntity('tenantSettings', { idParam: null })
  @Roles(...WRITE_ROLES)
  @Patch('tenant-info')
  updateTenantInfo(@Body() dto: UpdateTenantInfoDto) {
    return this.tenantSettingsService.updateTenantInfo(dto);
  }

  @AuditEntity('tenantSettings', { idParam: null })
  @Roles(...WRITE_ROLES)
  @Post('afip-certificate')
  uploadAfipCertificate(@Body() dto: UploadAfipCertificateDto) {
    return this.tenantSettingsService.uploadAfipCertificate(dto);
  }

  @AuditEntity('tenantSettings', { idParam: null })
  @Roles(...WRITE_ROLES)
  @Post('afip-certificate/generate-csr')
  generateAfipCsr(@Body() dto: GenerateAfipCsrDto) {
    return this.tenantSettingsService.generateAfipCsr(dto.alias);
  }

  // Sólo lee el archivo que se va a subir (no guarda nada).
  @Roles(...WRITE_ROLES)
  @Post('afip-certificate/inspect')
  inspectAfipFile(@Body() dto: InspectAfipFileDto) {
    return this.tenantSettingsService.inspectAfipFile(dto.text);
  }

  @AuditEntity('tenantSettings', { idParam: null })
  @Roles(...WRITE_ROLES)
  @Delete('afip-certificate')
  removeAfipCertificate() {
    return this.tenantSettingsService.removeAfipCertificate();
  }
}
