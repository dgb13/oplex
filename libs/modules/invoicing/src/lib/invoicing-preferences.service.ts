import { BadRequestException, Injectable } from '@nestjs/common';
import { getTenantDb, getUserId, type InvoicePdfFormat, type PdfStyle } from '@plexo/database';
import type { UpdateInvoicingPreferencesDto } from './dto/update-invoicing-preferences.dto.js';

export interface InvoicingPreferencesView {
  invoicePdfFormat: InvoicePdfFormat;
  invoicePdfStyle: PdfStyle;
}

/** Preferencia personal del usuario para "Descargar PDF" en Facturación -
 * mismo shape "GET/PATCH sobre el usuario autenticado, sin id en la ruta"
 * que PurchasePreferencesService, pero mucho más chica: Facturación ya
 * tiene su propia numeración por sucursal/punto de venta (pointOfSale),
 * no hay prefijos por usuario que gestionar acá. */
@Injectable()
export class InvoicingPreferencesService {
  async getPreferences(): Promise<InvoicingPreferencesView> {
    const userId = requireUserId();
    return getTenantDb().user.findUniqueOrThrow({
      where: { id: userId },
      select: { invoicePdfFormat: true, invoicePdfStyle: true },
    });
  }

  async updatePreferences(dto: UpdateInvoicingPreferencesDto): Promise<InvoicingPreferencesView> {
    const userId = requireUserId();
    return getTenantDb().user.update({
      where: { id: userId },
      data: { invoicePdfFormat: dto.invoicePdfFormat, invoicePdfStyle: dto.invoicePdfStyle },
      select: { invoicePdfFormat: true, invoicePdfStyle: true },
    });
  }
}

function requireUserId(): string {
  const userId = getUserId();
  if (!userId) {
    throw new BadRequestException('An authenticated user is required');
  }
  return userId;
}
