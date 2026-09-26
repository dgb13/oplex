import { Injectable } from '@nestjs/common';
import { AfipCredentialsService } from '@plexo/afip-credentials';
import { getTenantDb, getTenantId, type DocumentLetter } from '@plexo/database';
import { AfipWsfeClient, CBTE_TIPO } from './afip-wsfe-client.js';

export interface ArcaConnectionCheckResult {
  ok: boolean;
  // Qué falló, para que la pantalla lleve al paso correcto.
  problem: 'NOT_CONFIGURED' | 'NOT_AUTHORIZED' | 'CERTIFICATE' | 'NETWORK' | 'OTHER' | null;
  message: string;
  pointOfSale: number | null;
  documentLetter: DocumentLetter | null;
  lastNumber: number | null;
  checkedAt: string;
}

/**
 * "Probar conexión con ARCA" (Preferencias): pide a WSFE el último
 * comprobante autorizado del punto de venta de la primera sucursal, con la
 * letra que corresponde a la condición IVA de la empresa - confirma
 * certificado, autorización a wsfe y CUIT sin emitir ningún comprobante.
 * Guarda el resultado en TenantSettings para mostrar el estado sin volver
 * a consultar a ARCA cada vez que se abre la pantalla.
 */
@Injectable()
export class ArcaConnectionService {
  constructor(private readonly afipCredentials: AfipCredentialsService) {}

  async check(): Promise<ArcaConnectionCheckResult> {
    const tenantId = getTenantId();
    const db = getTenantDb();
    const checkedAt = new Date();

    const credentials = await this.afipCredentials.getCurrent();
    let result: ArcaConnectionCheckResult;
    if (!credentials) {
      result = {
        ok: false,
        problem: 'NOT_CONFIGURED',
        message: 'Falta cargar el certificado o el CUIT de la empresa.',
        pointOfSale: null,
        documentLetter: null,
        lastNumber: null,
        checkedAt: checkedAt.toISOString(),
      };
    } else {
      const [settings, branch] = await Promise.all([
        db.tenantSettings.findUnique({ where: { tenantId }, select: { ownTaxCondition: true } }),
        db.company.findFirst({
          where: { roles: { some: { role: 'BRANCH' } }, pointOfSaleNumber: { not: null } },
          orderBy: { createdAt: 'asc' },
          select: { pointOfSaleNumber: true },
        }),
      ]);
      const documentLetter: DocumentLetter =
        settings?.ownTaxCondition === 'RESPONSABLE_INSCRIPTO' ? 'B' : 'C';
      const pointOfSale = Number(branch?.pointOfSaleNumber ?? 1);
      try {
        const lastNumber = await new AfipWsfeClient(credentials).lastAuthorizedNumber(
          pointOfSale,
          CBTE_TIPO.FACTURA[documentLetter],
        );
        result = {
          ok: true,
          problem: null,
          message: `Conexión correcta. Último comprobante autorizado en el punto de venta ${String(pointOfSale).padStart(4, '0')}: Factura ${documentLetter} ${String(lastNumber).padStart(8, '0')}.`,
          pointOfSale,
          documentLetter,
          lastNumber,
          checkedAt: checkedAt.toISOString(),
        };
      } catch (err) {
        result = { ...describeFailure((err as Error).message), pointOfSale, documentLetter, lastNumber: null, checkedAt: checkedAt.toISOString() };
      }
    }

    await db.tenantSettings.upsert({
      where: { tenantId },
      create: { tenantId, afipLastCheckAt: checkedAt, afipLastCheckOk: result.ok, afipLastCheckMessage: result.message },
      update: { afipLastCheckAt: checkedAt, afipLastCheckOk: result.ok, afipLastCheckMessage: result.message },
    });
    return result;
  }
}

/** Traduce lo que devuelve ARCA a algo accionable. */
function describeFailure(raw: string): Pick<ArcaConnectionCheckResult, 'ok' | 'problem' | 'message'> {
  if (raw.includes('notAuthorized')) {
    return {
      ok: false,
      problem: 'NOT_AUTHORIZED',
      message:
        'ARCA reconoce el certificado pero no lo tiene autorizado para facturar. Hacé el paso 3.2: autorización de acceso al servicio "wsfe". Detalle de ARCA: ' +
        raw,
    };
  }
  if (/cms\.|cert|untrusted|expired|Computador no/i.test(raw) && !raw.includes('alreadyAuthenticated')) {
    return {
      ok: false,
      problem: 'CERTIFICATE',
      message:
        'ARCA no aceptó el certificado. Revisá que sea del ambiente elegido (homologación o producción) y que no esté vencido. Detalle de ARCA: ' +
        raw,
    };
  }
  if (raw.startsWith('No se pudo conectar')) {
    return { ok: false, problem: 'NETWORK', message: `No se pudo llegar a ARCA. Probá de nuevo en unos minutos. Detalle: ${raw}` };
  }
  return { ok: false, problem: 'OTHER', message: raw };
}
