import { Module, type OnModuleInit } from '@nestjs/common';
import { ConnectorRegistry, ConnectorsModule } from '@plexo/connectors';
import { MercadoPagoConfigService } from './mercadopago-config.service.js';
import { MercadoPagoConnector } from './mercadopago.connector.js';
import { MercadoPagoController } from './mercadopago.controller.js';
import { MercadoPagoInStoreClient } from './mercadopago-instore.client.js';
import { MercadoPagoOAuthClient } from './mercadopago-oauth.client.js';
import { MercadoPagoPaymentClient } from './mercadopago-payment.client.js';
import { MercadoPagoPaymentLinksController } from './mercadopago-payment-links.controller.js';
import { MercadoPagoPaymentService } from './mercadopago-payment.service.js';
import { MercadoPagoPreferenceClient } from './mercadopago-preference.client.js';
import { MercadoPagoQrService } from './mercadopago-qr.service.js';
import { MercadoPagoStateService } from './mercadopago-state.service.js';

// Not @Global() - same reasoning as ConnectorsModule/AfipCredentialsModule:
// only apps/api's composition root needs this (registers the controllers +
// the OnModuleInit registration below), no other module depends on it.
// MercadoPagoConfigService/MercadoPagoPaymentClient are exported too -
// apps/api's webhook module (composition root, needs SalesService) is a
// separate Nest module from this one and imports both this module and
// ConnectorsModule directly for what it needs to reconcile a payment.
@Module({
  imports: [ConnectorsModule],
  controllers: [MercadoPagoController, MercadoPagoPaymentLinksController],
  providers: [
    MercadoPagoConfigService,
    MercadoPagoOAuthClient,
    MercadoPagoPaymentClient,
    MercadoPagoPreferenceClient,
    MercadoPagoStateService,
    MercadoPagoConnector,
    MercadoPagoPaymentService,
    MercadoPagoInStoreClient,
    MercadoPagoQrService,
  ],
  exports: [
    MercadoPagoConfigService,
    MercadoPagoConnector,
    MercadoPagoPaymentClient,
    MercadoPagoPaymentService,
    MercadoPagoQrService,
  ],
})
export class MercadoPagoModule implements OnModuleInit {
  constructor(
    private readonly registry: ConnectorRegistry,
    private readonly connector: MercadoPagoConnector,
  ) {}

  // Registration happens here, not in ConnectorsModule, so adding
  // Tiendanube/Mercado Libre later is "new module + this same one-line
  // onModuleInit", never a change to @plexo/connectors itself.
  onModuleInit(): void {
    this.registry.register(this.connector);
  }
}
