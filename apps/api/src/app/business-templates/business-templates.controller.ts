import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, PlatformAdminGuard, Roles } from '@plexo/auth';
import type { AuthenticatedUser } from '@plexo/types';
import { BusinessProfileService } from './business-profile.service.js';
import { BusinessTemplatesService } from './business-templates.service.js';
import { TemplateUpdatesService } from './template-updates.service.js';
import {
  ChooseBusinessTemplateDto,
  CreateBusinessTemplateDto,
  CreateBusinessTemplateRequestDto,
  UpdateBusinessTemplateDto,
  UpdateBusinessTemplateRequestDto,
  ApplyTemplateUpdatesDto,
  UpdateEnabledModulesDto,
} from './dto/business-template.dto.js';

// Rubro y módulos son configuración de todo el negocio: los mismos roles
// que editan Preferencias (ver TenantSettingsController).
const WRITE_ROLES = ['OWNER', 'ADMIN'] as const;

/** Catálogo de rubros activos (alta y "Cambiar rubro"). */
@Controller('business-templates')
export class BusinessTemplatesController {
  constructor(
    private readonly templates: BusinessTemplatesService,
    private readonly profile: BusinessProfileService,
  ) {}

  @Get()
  list() {
    return this.templates.listActive();
  }

  /** "No encuentro mi rubro → pedir que lo agreguen". */
  @Post('requests')
  request(@Body() dto: CreateBusinessTemplateRequestDto) {
    return this.profile.requestTemplate(dto.text);
  }
}

/** Rubro y módulos del propio negocio. */
@Controller('business-profile')
export class BusinessProfileController {
  constructor(
    private readonly profile: BusinessProfileService,
    private readonly updates: TemplateUpdatesService,
  ) {}

  /** "Hay novedades para tu rubro": lo nuevo de la plantilla que el negocio
   * todavía no tiene (null si no hay). */
  @Roles(...WRITE_ROLES)
  @Get('updates')
  pendingUpdates() {
    return this.updates.pending();
  }

  @Roles(...WRITE_ROLES)
  @Post('updates/apply')
  applyUpdates(@Body() dto: ApplyTemplateUpdatesDto) {
    return this.updates.apply(dto.ids);
  }

  @Roles(...WRITE_ROLES)
  @Post('updates/dismiss')
  dismissUpdates() {
    return this.updates.dismiss();
  }

  @Get()
  get() {
    return this.profile.getProfile();
  }

  @Roles(...WRITE_ROLES)
  @Post('choose')
  choose(@Body() dto: ChooseBusinessTemplateDto) {
    return this.profile.choose(dto.key);
  }

  @Roles(...WRITE_ROLES)
  @Post('skip')
  skip() {
    return this.profile.skip();
  }

  @Roles(...WRITE_ROLES)
  @Patch('modules')
  updateModules(@Body() dto: UpdateEnabledModulesDto) {
    return this.profile.updateModules(dto.enabledModules);
  }
}

/** /admin/rubros (sólo PLATFORM_ADMIN_EMAILS). Catálogo global, sin
 * @AuditEntity (ese log es por negocio) - el historial queda en
 * BusinessTemplateVersion con quién publicó cada versión. */
@Controller('admin/business-templates')
@UseGuards(PlatformAdminGuard)
export class AdminBusinessTemplatesController {
  constructor(private readonly templates: BusinessTemplatesService) {}

  @Get()
  list() {
    return this.templates.listAll();
  }

  @Post()
  create(@Body() dto: CreateBusinessTemplateDto, @CurrentUser() admin: AuthenticatedUser) {
    return this.templates.create(dto, admin.email);
  }

  @Get('requests')
  listRequests() {
    return this.templates.listRequests();
  }

  @Patch('requests/:id')
  updateRequest(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBusinessTemplateRequestDto) {
    return this.templates.updateRequest(id, dto.status);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBusinessTemplateDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.templates.update(id, dto, admin.email);
  }
}
