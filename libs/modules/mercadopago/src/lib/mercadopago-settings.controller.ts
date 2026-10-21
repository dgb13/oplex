import { Body, Controller, Get, Patch } from '@nestjs/common';
import { Roles } from '@plexo/auth';
import { UpdateMercadoPagoSettingsDto } from './dto/update-mercadopago-settings.dto.js';
import { MercadoPagoSettingsService, type MercadoPagoSettingsView } from './mercadopago-settings.service.js';

/** Mercado Pago › Configuración (links prendidos/apagados y cuenta de
 * dinero): Dueño/Admin, igual que conectar y desconectar. */
@Controller('connectors/mercadopago/settings')
export class MercadoPagoSettingsController {
  constructor(private readonly settings: MercadoPagoSettingsService) {}

  @Roles('OWNER', 'ADMIN')
  @Get()
  get(): Promise<MercadoPagoSettingsView> {
    return this.settings.get();
  }

  @Roles('OWNER', 'ADMIN')
  @Patch()
  update(@Body() dto: UpdateMercadoPagoSettingsDto): Promise<MercadoPagoSettingsView> {
    return this.settings.update(dto);
  }
}
