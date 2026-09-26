import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import { AfipCredentialsService } from '@plexo/afip-credentials';
import { AfipWsfeClient } from './afip-wsfe-client.js';
import type {
  ElectronicInvoiceRequest,
  ElectronicInvoiceResult,
  ElectronicInvoicingPort,
} from './electronic-invoicing.port.js';

/**
 * Resolves the current tenant's AFIP credentials on every call (never
 * cached on `this`) - see AfipCredentialsService's docstring for why a
 * factory/constructor can't do this once at boot in a multi-tenant app.
 */
@Injectable()
export class RealElectronicInvoicingService implements ElectronicInvoicingPort {
  constructor(private readonly afipCredentials: AfipCredentialsService) {}

  async requestCae(invoice: ElectronicInvoiceRequest): Promise<ElectronicInvoiceResult> {
    const credentials = await this.afipCredentials.getCurrent();
    if (!credentials) {
      throw new BadRequestException(
        'Esta empresa todavía no configuró su certificado ARCA (Preferencias → Conexión con ARCA)',
      );
    }
    const client = new AfipWsfeClient(credentials);
    try {
      return await client.requestCae(invoice);
    } catch (err) {
      // AfipWsfeClient/AfipWsaaClient throw plain Errors for anything that
      // goes wrong talking to AFIP itself (unreachable, rejected cert,
      // voucher rejected) - same 502 convention as AfipLookupError in the
      // padrón integration (see CompaniesService.lookupAfip), since this is
      // the upstream failing, not a malformed request on our end.
      throw new BadGatewayException((err as Error).message);
    }
  }
}
