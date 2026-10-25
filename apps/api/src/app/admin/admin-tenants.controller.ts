import { Body, Controller, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentUser, PlatformAdminGuard } from '@plexo/auth';
import type { AuthenticatedUser } from '@plexo/types';
import { AdminTenantInsightsService } from './admin-tenant-insights.service.js';
import { AdminTenantsService } from './admin-tenants.service.js';
import { CreateTenantDto } from './dto/create-tenant.dto.js';
import { ImpersonateUserDto } from './dto/impersonate-user.dto.js';
import { SaveTenantNoteDto } from './dto/save-tenant-note.dto.js';
import { UpdateTenantStatusDto } from './dto/update-tenant-status.dto.js';

@Controller('admin/tenants')
@UseGuards(PlatformAdminGuard)
export class AdminTenantsController {
  constructor(
    private readonly adminTenantsService: AdminTenantsService,
    private readonly insights: AdminTenantInsightsService,
  ) {}

  @Get()
  list() {
    return this.insights.listTenants();
  }

  /** Ficha del tenant: línea de tiempo, integraciones, usuarios, consumo. */
  @Get(':id/detail')
  detail(@Param('id') id: string) {
    return this.insights.getTenantDetail(id);
  }

  /** Notas internas del operador (no las ve el tenant). Vacío = borrar. */
  @Put(':id/note')
  saveNote(@Param('id') id: string, @Body() dto: SaveTenantNoteDto, @CurrentUser() admin: AuthenticatedUser) {
    return this.insights.saveNote(id, dto.body, admin.email);
  }

  @Post()
  create(@Body() dto: CreateTenantDto) {
    return this.adminTenantsService.createTenant(dto);
  }

  @Get(':id/users')
  listUsers(@Param('id') id: string) {
    return this.adminTenantsService.listTenantUsers(id);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateTenantStatusDto) {
    return this.adminTenantsService.updateTenantStatus(id, dto.status);
  }

  @Post(':id/impersonate')
  impersonate(
    @Param('id') id: string,
    @Body() dto: ImpersonateUserDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.adminTenantsService.impersonate(id, dto.userId, { id: admin.sub, email: admin.email });
  }
}
