import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Roles } from '@plexo/auth';
import { CreateCatalogItemDto } from './dto/create-catalog-item.dto.js';
import { UpdateCatalogItemDto } from './dto/update-catalog-item.dto.js';
import { PurchaseCatalogsService } from './purchase-catalogs.service.js';

const WRITE_ROLES = ['OWNER', 'ADMIN', 'INVENTORY', 'PURCHASES'] as const;

@Controller('purchases/catalogs')
export class PurchaseCatalogsController {
  constructor(private readonly catalogsService: PurchaseCatalogsService) {}

  @Get(':type')
  list(@Param('type') type: string, @Query('includeInactive') includeInactive?: string) {
    return this.catalogsService.list(type, includeInactive === 'true');
  }

  @Roles(...WRITE_ROLES)
  @Post(':type')
  create(@Param('type') type: string, @Body() dto: CreateCatalogItemDto) {
    return this.catalogsService.create(type, dto);
  }

  // No @AuditEntity here: the decorator's modelName is fixed at
  // route-definition time, but this one route serves 3 different Prisma
  // models depending on :type - can't resolve that dynamically without
  // changing the shared decorator/interceptor. Low-stakes config
  // (transport/payment/delivery labels), not worth that shared-infra change.
  @Roles(...WRITE_ROLES)
  @Patch(':type/:id')
  update(
    @Param('type') type: string,
    @Param('id') id: string,
    @Body() dto: UpdateCatalogItemDto,
  ) {
    return this.catalogsService.update(type, id, dto);
  }
}
