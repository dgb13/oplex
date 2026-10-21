import { Module } from '@nestjs/common';
import { InvoicingModule } from '@plexo/invoicing';
import { MercadoPagoModule } from '@plexo/mercadopago';
import { TenantSettingsModule } from '@plexo/tenant-settings';
import { MercadoPagoLinksEmailController } from './mercadopago-links-email.controller.js';

@Module({
  imports: [MercadoPagoModule, InvoicingModule, TenantSettingsModule],
  controllers: [MercadoPagoLinksEmailController],
})
export class MercadoPagoLinksModule {}
