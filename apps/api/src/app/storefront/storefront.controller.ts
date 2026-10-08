import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Public, Roles } from '@plexo/auth';
import { CreateStorefrontOrderDto, UpdateStorefrontOrderStatusDto, UpdateStorefrontSettingsDto } from './storefront.dto.js';
import { StorefrontService } from './storefront.service.js';

const MANAGE_ROLES = ['OWNER', 'ADMIN'] as const;
const ORDER_ROLES = ['OWNER', 'ADMIN', 'SALES'] as const;

/** Configuración y pedidos de la tienda, desde adentro de Oplex. */
@Controller('storefront')
export class StorefrontController {
  constructor(private readonly storefrontService: StorefrontService) {}

  @Roles(...MANAGE_ROLES)
  @Get('settings')
  getSettings() {
    return this.storefrontService.getAdminView();
  }

  @Roles(...MANAGE_ROLES)
  @Put('settings')
  saveSettings(@Body() dto: UpdateStorefrontSettingsDto) {
    return this.storefrontService.saveSettings(dto);
  }

  @Roles(...MANAGE_ROLES)
  @Post('cover')
  async uploadCover(@Req() req: FastifyRequest) {
    const data = await req.file();
    if (!data) throw new BadRequestException('No se recibió ningún archivo');
    return this.storefrontService.setCover(data.mimetype, await data.toBuffer());
  }

  @Roles(...MANAGE_ROLES)
  @Delete('cover')
  removeCover() {
    return this.storefrontService.removeCover();
  }

  @Roles(...MANAGE_ROLES)
  @Get('subdomain-check')
  checkSubdomain(@Query('subdomain') subdomain = '') {
    return this.storefrontService.checkSubdomain(subdomain);
  }

  @Roles(...MANAGE_ROLES)
  @Get('preview')
  preview() {
    return this.storefrontService.getPreview();
  }

  @Roles(...ORDER_ROLES)
  @Get('orders')
  listOrders() {
    return this.storefrontService.listOrders();
  }

  @Roles(...ORDER_ROLES)
  @Patch('orders/:id')
  updateOrder(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStorefrontOrderStatusDto) {
    return this.storefrontService.updateOrderStatus(id, dto.status);
  }
}

/** La tienda que ve cualquiera, sin sesión. Resuelve la empresa por la
 * dirección (find_storefront_by_subdomain) y recién ahí abre su contexto. */
@Controller('public/storefront')
export class PublicStorefrontController {
  constructor(private readonly storefrontService: StorefrontService) {}

  // Caddy pregunta acá antes de sacar el certificado HTTPS de un
  // subdominio (on_demand_tls): sólo se emiten para tiendas que existen.
  @Public()
  @Get('domain-check')
  async domainCheck(@Query('domain') domain = ''): Promise<string> {
    if (!(await this.storefrontService.isKnownStoreDomain(domain))) {
      throw new NotFoundException();
    }
    return 'ok';
  }

  @Public()
  @Get(':subdomain')
  getStore(@Param('subdomain') subdomain: string) {
    return this.storefrontService.getPublicStore(subdomain);
  }

  @Public()
  @Post(':subdomain/orders')
  @HttpCode(201)
  createOrder(
    @Param('subdomain') subdomain: string,
    @Body() dto: CreateStorefrontOrderDto,
    @Headers('x-forwarded-for') forwardedFor: string | undefined,
    @Req() req: FastifyRequest,
  ) {
    const ip = forwardedFor?.split(',')[0]?.trim() || req.ip;
    return this.storefrontService.createPublicOrder(subdomain, dto, ip);
  }
}
