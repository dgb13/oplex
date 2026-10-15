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
 * "Probar conexión con ARCA" (Contabilidad → Conexión con ARCA): pide a WSFE el último
 * comprobante autorizado del punto de venta de cada sucursal activa, con la
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
      const [settings, branches] = await Promise.all([
        db.tenantSettings.findUnique({ where: { tenantId }, select: { ownTaxCondition: true } }),
        // Todas las sucursales activas con punto de venta: cada una factura con
        // el suyo, y uno que no sea de Web Services recién fallaría al emitir.
        db.company.findMany({
          where: { active: true, roles: { some: { role: 'BRANCH' } }, pointOfSaleNumber: { not: null } },
          orderBy: { createdAt: 'asc' },
          select: { name: true, pointOfSaleNumber: true },
        }),
      ]);
      const documentLetter: DocumentLetter =
        settings?.ownTaxCondition === 'RESPONSABLE_INSCRIPTO' ? 'B' : 'C';
      const pointsOfSale = new Map<number, string>();
      for (const branch of branches) {
        const pointOfSale = Number.parseInt(branch.pointOfSaleNumber ?? '', 10);
        if (Number.isFinite(pointOfSale) && !pointsOfSale.has(pointOfSale)) pointsOfSale.set(pointOfSale, branch.name);
      }

      if (pointsOfSale.size === 0) {
        result = {
          ok: false,
          problem: 'OTHER',
          message:
            'Falta una sucursal con punto de venta. Creala en Sucursales con el número de punto de venta de Web Services que diste de alta en ARCA y volvé a probar.',
          pointOfSale: null,
          documentLetter,
          lastNumber: null,
          checkedAt: checkedAt.toISOString(),
        };
      } else {
        const client = new AfipWsfeClient(credentials);
        const lines: string[] = [];
        let failure: ArcaConnectionCheckResult | null = null;
        let first: { pointOfSale: number; lastNumber: number } | null = null;
        for (const [pointOfSale, branchName] of pointsOfSale) {
          try {
            const lastNumber = await client.lastAuthorizedNumber(pointOfSale, CBTE_TIPO.FACTURA[documentLetter]);
            first ??= { pointOfSale, lastNumber };
            lines.push(
              `punto de venta ${formatPointOfSale(pointOfSale)} (${branchName}): Factura ${documentLetter} ${String(lastNumber).padStart(8, '0')}`,
            );
          } catch (err) {
            failure = {
              ...describeFailure((err as Error).message, { pointOfSale, branchName }),
              pointOfSale,
              documentLetter,
              lastNumber: null,
              checkedAt: checkedAt.toISOString(),
            };
            break;
          }
        }
        if (failure) {
          result = failure;
        } else {
          // Comprobantes que ARCA autorizó y Oplex no tiene (ver
          // InvoicingService.reserveVoucherNumber) - acá también, no sólo en
          // la campana: el aviso nunca le llega a quien hizo la venta.
          const unregistered = await db.arcaUnregisteredVoucher.count({ where: { resolvedAt: null } });
          const unregisteredNote =
            unregistered > 0
              ? ` Atención: ARCA tiene ${unregistered === 1 ? '1 comprobante autorizado' : `${unregistered} comprobantes autorizados`} que no ${unregistered === 1 ? 'está registrado' : 'están registrados'} en Oplex.`
              : '';
          result = {
            ok: true,
            problem: null,
            message: `Conexión correcta. Último comprobante autorizado en el ${lines.join('; en el ')}.${unregisteredNote}`,
            pointOfSale: first?.pointOfSale ?? null,
            documentLetter,
            lastNumber: first?.lastNumber ?? null,
            checkedAt: checkedAt.toISOString(),
          };
        }
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
function describeFailure(
  raw: string,
  context: { pointOfSale: number; branchName: string },
): Pick<ArcaConnectionCheckResult, 'ok' | 'problem' | 'message'> {
  // [11002] El punto de venta no se encuentra habilitado a usar en el presente WS.
  if (raw.includes('[11002]')) {
    return {
      ok: false,
      problem: 'OTHER',
      message: `El punto de venta ${formatPointOfSale(context.pointOfSale)} de la sucursal "${context.branchName}" no está habilitado para Web Services en ARCA. Corregí el número en Sucursales (ahí está la ayuda "¿Dónde lo encuentro?") o desactivá esa sucursal si ya no la usás. Detalle de ARCA: ${raw}`,
    };
  }
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

function formatPointOfSale(pointOfSale: number): string {
  return String(pointOfSale).padStart(5, '0');
}
