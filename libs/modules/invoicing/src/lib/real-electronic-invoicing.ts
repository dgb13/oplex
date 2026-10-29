import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import { AfipCredentialsService } from '@plexo/afip-credentials';
import { getTenantDb } from '@plexo/database';
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
    return this.withClient((client) => client.requestCae(invoice), invoice.pointOfSale);
  }

  async lastAuthorizedNumber(sequence: VoucherSequence): Promise<number> {
    return this.withClient((client) =>
      client.lastAuthorizedNumber(
        Number.parseInt(sequence.pointOfSale, 10),
        CBTE_TIPO[sequence.kind][sequence.documentLetter],
      ),
      sequence.pointOfSale,
    );
  }

  async getAuthorizedVoucher(sequence: VoucherSequence, number: number): Promise<AuthorizedVoucher> {
    return this.withClient((client) =>
      client.getAuthorizedVoucher(
        Number.parseInt(sequence.pointOfSale, 10),
        CBTE_TIPO[sequence.kind][sequence.documentLetter],
        number,
      ),
      sequence.pointOfSale,
    );
  }

  private async withClient<T>(fn: (client: AfipWsfeClient) => Promise<T>, pointOfSale?: string): Promise<T> {
    const credentials = await this.afipCredentials.getCurrent();
    if (!credentials) {
      throw new BadRequestException(
        'Esta empresa todavía no configuró su certificado ARCA (Conexión con ARCA)',
      );
    }
    const client = new AfipWsfeClient(credentials);
    try {
      return await fn(client);
    } catch (err) {
      // AfipWsfeClient/AfipWsaaClient throw plain Errors for anything that
      // goes wrong talking to AFIP itself (unreachable, rejected cert,
      // voucher rejected) - same 502 convention as AfipLookupError in the
      // padrón integration (see CompaniesService.lookupAfip), since this is
      // the upstream failing, not a malformed request on our end.
      const raw = (err as Error).message;
      if (pointOfSale && raw.includes('[11002]')) {
        throw new BadGatewayException(await pointOfSaleNotEnabled(client, raw, pointOfSale));
      }
      throw new BadGatewayException(explainArcaError(raw, pointOfSale));
    }
  }
}

/** Cuerpo del 502 para un 11002: además del texto, los datos para que la
 * pantalla ofrezca "Usar 00002 en Casa Central" sin otra consulta. */
export interface PointOfSaleNotEnabledError {
  message: string;
  code: 'ARCA_POINT_OF_SALE_NOT_ENABLED';
  pointOfSale: string;
  enabledPointsOfSale: number[];
  branch: { id: string; name: string } | null;
}

async function pointOfSaleNotEnabled(
  client: AfipWsfeClient,
  raw: string,
  pointOfSale: string,
): Promise<PointOfSaleNotEnabledError> {
  // Sólo pistas: si alguna consulta falla, queda el error principal.
  const [enabled, branch] = await Promise.all([
    client
      .enabledPointsOfSale()
      .then((points) => points.filter((p) => !p.blocked && !p.deregisteredOn).map((p) => p.number))
      .catch(() => null),
    getTenantDb()
      .company.findFirst({
        where: { active: true, pointOfSaleNumber: pointOfSale, roles: { some: { role: 'BRANCH' } } },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true },
      })
      .catch(() => null),
  ]);
  return {
    message: explainArcaError(raw, pointOfSale, enabled ?? undefined),
    code: 'ARCA_POINT_OF_SALE_NOT_ENABLED',
    pointOfSale,
    enabledPointsOfSale: enabled ?? [],
    branch,
  };
}

/** El texto de ARCA no dice qué hacer; para los errores que el usuario
 * resuelve solo, se antepone la explicación (mismo criterio que
 * ArcaConnectionService.describeFailure). */
export function explainArcaError(raw: string, pointOfSale?: string, enabled?: number[]): string {
  // [11002] El punto de venta no se encuentra habilitado a usar en el presente WS.
  if (raw.includes('[11002]')) {
    const pv = pointOfSale ? `El punto de venta ${pointOfSale.padStart(5, '0')}` : 'El punto de venta';
    const list =
      enabled === undefined
        ? ''
        : enabled.length === 0
          ? ' ARCA no informa ningún punto de venta de Web Services para tu CUIT: hay que crear uno.'
          : ` Habilitados para Web Services: ${enabled.map((n) => String(n).padStart(5, '0')).join(', ')}.`;
    return `${pv} no es de Web Services en ARCA (puede ser el de Comprobantes en línea o no existir).${list} Se corrige en Conexión con ARCA, paso 5 (Punto de venta). Detalle de ARCA: ${raw}`;
  }
  return raw;
}
