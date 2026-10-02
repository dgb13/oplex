import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import { AfipCredentialsService } from '@plexo/afip-credentials';
import { AfipWsfeClient, CBTE_TIPO } from './afip-wsfe-client.js';
import type {
  AuthorizedVoucher,
  ElectronicInvoiceRequest,
  ElectronicInvoiceResult,
  ElectronicInvoicingPort,
  VoucherSequence,
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
    return this.withClient((client) => client.requestCae(invoice));
  }

  async lastAuthorizedNumber(sequence: VoucherSequence): Promise<number> {
    return this.withClient((client) =>
      client.lastAuthorizedNumber(
        Number.parseInt(sequence.pointOfSale, 10),
        CBTE_TIPO[sequence.kind][sequence.documentLetter],
      ),
    );
  }

  async getAuthorizedVoucher(sequence: VoucherSequence, number: number): Promise<AuthorizedVoucher> {
    return this.withClient((client) =>
      client.getAuthorizedVoucher(
        Number.parseInt(sequence.pointOfSale, 10),
        CBTE_TIPO[sequence.kind][sequence.documentLetter],
        number,
      ),
    );
  }

  private async withClient<T>(fn: (client: AfipWsfeClient) => Promise<T>): Promise<T> {
    const credentials = await this.afipCredentials.getCurrent();
    if (!credentials) {
      throw new BadRequestException(
        'Esta empresa todavía no configuró su certificado ARCA (Contabilidad → Conexión con ARCA)',
      );
    }
    try {
      return await fn(new AfipWsfeClient(credentials));
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
