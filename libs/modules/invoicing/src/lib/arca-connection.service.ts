import { Injectable } from '@nestjs/common';
import { AfipCredentialsService } from '@plexo/afip-credentials';
import { getTenantDb, getTenantId, type DocumentLetter } from '@plexo/database';
import { AfipWsfeClient, CBTE_TIPO } from './afip-wsfe-client.js';

export interface ArcaConnectionCheckResult {
  ok: boolean;
  // Qué falló, para que la pantalla lleve al paso correcto.
  problem: 'NOT_CONFIGURED' | 'NOT_AUTHORIZED' | 'CERTIFICATE' | 'NETWORK' | 'POINT_OF_SALE' | 'OTHER' | null;
  message: string;
  pointOfSale: number | null;
  documentLetter: DocumentLetter | null;
  lastNumber: number | null;
  // Cada punto de venta probado con éxito (paso 5: "la primera va a ser...").
  points: { pointOfSale: number; branchName: string; lastNumber: number }[];
  checkedAt: string;
}

/** Paso 5 de "Conexión con ARCA": los puntos de venta de Web Services que
 * ARCA tiene para el CUIT, cruzados con las sucursales de Oplex. ARCA sólo
 * informa los de Web Services: los de "Comprobantes en línea" no aparecen. */
export interface ArcaPointsOfSaleResult {
  ok: boolean;
  problem: ArcaConnectionCheckResult['problem'];
  message: string | null;
  // Habilitados (ni bloqueados ni dados de baja).
  enabled: number[];
  // Los que ARCA informa pero no se pueden usar.
  unavailable: { number: number; blocked: boolean; deregisteredOn: string | null }[];
  branches: { id: string; name: string; pointOfSaleNumber: string | null; enabled: boolean }[];
}

/**
 * "Probar conexión con ARCA" (Conexión con ARCA): pide a WSFE el último
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
        points: [],
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
          problem: 'POINT_OF_SALE',
          message:
            'Falta una sucursal con punto de venta. Hacé el paso 5 (Punto de venta): Oplex busca en ARCA el de Web Services y lo carga en tu sucursal.',
          pointOfSale: null,
          documentLetter,
          lastNumber: null,
          points: [],
          checkedAt: checkedAt.toISOString(),
        };
      } else {
        const client = new AfipWsfeClient(credentials);
        const lines: string[] = [];
        let failure: ArcaConnectionCheckResult | null = null;
        const points: ArcaConnectionCheckResult['points'] = [];
        for (const [pointOfSale, branchName] of pointsOfSale) {
          try {
            const lastNumber = await client.lastAuthorizedNumber(pointOfSale, CBTE_TIPO.FACTURA[documentLetter]);
            points.push({ pointOfSale, branchName, lastNumber });
            lines.push(
              `punto de venta ${formatPointOfSale(pointOfSale)} (${branchName}): Factura ${documentLetter} ${String(lastNumber).padStart(8, '0')}`,
            );
          } catch (err) {
            const raw = (err as Error).message;
            const enabled = raw.includes('[11002]') ? await describeEnabledPointsOfSale(client) : '';
            failure = {
              ...describeFailure(raw, { pointOfSale, branchName, enabled }),
              pointOfSale,
              documentLetter,
              lastNumber: null,
              points,
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
            pointOfSale: points[0]?.pointOfSale ?? null,
            documentLetter,
            lastNumber: points[0]?.lastNumber ?? null,
            points,
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

  async pointsOfSale(): Promise<ArcaPointsOfSaleResult> {
    const branchRows = await getTenantDb().company.findMany({
      where: { active: true, roles: { some: { role: 'BRANCH' } } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, pointOfSaleNumber: true },
    });
    const withStatus = (enabled: number[]) =>
      branchRows.map((branch) => ({
        ...branch,
        enabled: branch.pointOfSaleNumber !== null && enabled.includes(Number.parseInt(branch.pointOfSaleNumber, 10)),
      }));

    const credentials = await this.afipCredentials.getCurrent();
    if (!credentials) {
      return {
        ok: false,
        problem: 'NOT_CONFIGURED',
        message: 'Falta cargar el certificado o el CUIT de la empresa.',
        enabled: [],
        unavailable: [],
        branches: withStatus([]),
      };
    }
    try {
      const points = await new AfipWsfeClient(credentials).enabledPointsOfSale();
      const enabled = points.filter((p) => !p.blocked && !p.deregisteredOn).map((p) => p.number);
      return {
        ok: true,
        problem: null,
        message: null,
        enabled,
        unavailable: points
          .filter((p) => p.blocked || p.deregisteredOn)
          .map((p) => ({ number: p.number, blocked: p.blocked, deregisteredOn: p.deregisteredOn })),
        branches: withStatus(enabled),
      };
    } catch (err) {
      return { ...describeFailure((err as Error).message), enabled: [], unavailable: [], branches: withStatus([]) };
    }
  }
}

/** Traduce lo que devuelve ARCA a algo accionable. */
function describeFailure(
  raw: string,
  context?: { pointOfSale: number; branchName: string; enabled: string },
): Pick<ArcaConnectionCheckResult, 'ok' | 'problem' | 'message'> {
  // [11002] El punto de venta no se encuentra habilitado a usar en el presente WS.
  if (context && raw.includes('[11002]')) {
    return {
      ok: false,
      problem: 'POINT_OF_SALE',
      message: `El punto de venta ${formatPointOfSale(context.pointOfSale)} de la sucursal "${context.branchName}" no está habilitado para Web Services en ARCA. Hacé el paso 5 (Punto de venta) para asignarle uno habilitado, o desactivá esa sucursal si ya no la usás. ${context.enabled} Detalle de ARCA: ${raw}`,
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

/** Para un 11002: qué puntos de venta sí tiene ARCA para Web Services en
 * este CUIT (FEParamGetPtosVenta). Si la consulta falla no se agrega nada:
 * es sólo una pista, el error principal ya está explicado. */
async function describeEnabledPointsOfSale(client: AfipWsfeClient): Promise<string> {
  try {
    const points = await client.enabledPointsOfSale();
    const usable = points.filter((p) => !p.blocked && !p.deregisteredOn);
    const others = points.filter((p) => p.blocked || p.deregisteredOn);
    const otherNote = others.length
      ? ` Bloqueados o dados de baja: ${others
          .map((p) => `${formatPointOfSale(p.number)}${p.blocked ? ' (bloqueado)' : ''}${p.deregisteredOn ? ` (baja ${p.deregisteredOn})` : ''}`)
          .join(', ')}.`
      : '';
    if (usable.length === 0) {
      return `ARCA no informa ningún punto de venta habilitado para Web Services en este CUIT.${otherNote} Si lo creaste hace poco, revisá en ARCA que el sistema sea el de Web Services o probá de nuevo más tarde.`;
    }
    return `Puntos de venta habilitados para Web Services según ARCA: ${usable.map((p) => formatPointOfSale(p.number)).join(', ')}.${otherNote}`;
  } catch {
    return '';
  }
}

function formatPointOfSale(pointOfSale: number): string {
  return String(pointOfSale).padStart(5, '0');
}
