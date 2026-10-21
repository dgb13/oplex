import { BadRequestException, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Roles } from '@plexo/auth';
import { getTenantDb, getTenantId } from '@plexo/database';
import { InvoicingService } from '@plexo/invoicing';
import { MercadoPagoPaymentService } from '@plexo/mercadopago';
import { resolveEmailFrom, TenantSettingsService } from '@plexo/tenant-settings';

// Mismo formato de monto que el correo de la acción del asistente.
const MONEY = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Mercado Pago › Links de pago › "Reenviar por correo" (etapa 4 de
 * plan-seccion-mercadopago.md). Vive en apps/api y no en @plexo/mercadopago
 * porque compone módulos (mercadopago + invoicing + tenant-settings), igual
 * que la acción "link de pago" del asistente, que manda el mismo correo.
 */
@Controller('connectors/mercadopago/payment-links')
export class MercadoPagoLinksEmailController {
  constructor(
    private readonly paymentService: MercadoPagoPaymentService,
    private readonly invoicingService: InvoicingService,
    private readonly tenantSettingsService: TenantSettingsService,
  ) {}

  @Roles('OWNER', 'ADMIN')
  @Post(':id/email')
  async email(@Param('id', ParseUUIDPipe) id: string): Promise<{ to: string }> {
    const link = (await this.paymentService.listPaymentLinks()).find((l) => l.id === id);
    if (!link) {
      throw new BadRequestException('No se encontró ese link de pago');
    }
    if (link.status !== 'PENDING' || !link.initPoint) {
      throw new BadRequestException('Sólo se puede reenviar un link que está esperando el pago');
    }
    if (!link.customerEmail) {
      throw new BadRequestException(
        `${link.customerName ?? 'El cliente'} no tiene correo cargado. Cargalo en Empresas o copiá el link y mandalo vos.`,
      );
    }
    const [settings, tenant] = await Promise.all([
      this.tenantSettingsService.getSettings(),
      getTenantDb().tenant.findUnique({ where: { id: getTenantId() }, select: { name: true } }),
    ]);
    await this.invoicingService.emailPaymentLink({
      to: link.customerEmail,
      invoiceLabel: link.documentLabel,
      amount: MONEY.format(Number(link.amount)),
      currencyCode: link.currency,
      url: link.initPoint,
      businessName: tenant?.name ?? 'Tu proveedor',
      from: resolveEmailFrom(settings),
    });
    return { to: link.customerEmail };
  }
}
