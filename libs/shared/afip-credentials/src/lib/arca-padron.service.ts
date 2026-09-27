import { Injectable } from '@nestjs/common';
import { PrismaService, type AfipEnvironment } from '@plexo/database';
import { EncryptionService } from '@plexo/encryption';
import { XMLParser } from 'fast-xml-parser';
import { detectAfipFileKind, inspectAfipCertificate, parseAndValidateAfipCertificate } from './afip-certificate.js';
import { AfipWsaaClient, type WsaaTicket, type WsaaTicketStore } from './afip-wsaa-client.js';

const SERVICE = 'ws_sr_constancia_inscripcion';
const PLATFORM_SETTINGS_ID = 'global';
const CACHE_DAYS = 30;

const URL_BY_ENV: Record<AfipEnvironment, string> = {
  HOMOLOGACION: 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5',
  PRODUCCION: 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5',
};

const xmlParser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });

export type ArcaIvaCondition = 'RESPONSABLE_INSCRIPTO' | 'MONOTRIBUTO' | 'EXENTO';

/** Lo que Oplex usa de la constancia de inscripción de un CUIT. */
export interface ArcaPadronPerson {
  cuit: string;
  personType: 'FISICA' | 'JURIDICA';
  // Razón social (jurídica) o "APELLIDO NOMBRE" (física), como en ARCA.
  name: string;
  ivaCondition: ArcaIvaCondition | null;
  // Etiqueta para mostrar/guardar en Company.taxCondition ("Monotributo
  // (categoría D)", "Responsable Inscripto", "Exento").
  taxConditionLabel: string | null;
  fiscalAddress: string | null;
  mainActivity: string | null;
  // "AAAA-MM": ARCA informa sólo mes y año (el alta más antigua entre
  // impuestos activos y actividades), no el día.
  activityStartMonth: string | null;
  fromCache: boolean;
}

export class ArcaPadronNotConfiguredError extends Error {
  constructor() {
    super('Oplex todavía no tiene cargado su certificado para consultar el padrón de ARCA (Admin → Estado del sistema).');
  }
}
export class ArcaPadronNotFoundError extends Error {
  constructor(
    cuit: string,
    readonly env: AfipEnvironment = 'PRODUCCION',
  ) {
    // El padrón de homologación sólo tiene CUITs de prueba con datos
    // ficticios - un CUIT real "no existe" ahí, y sin aclararlo parece que
    // el CUIT está mal.
    super(
      env === 'HOMOLOGACION'
        ? `ARCA no encontró el CUIT ${cuit}: la consulta está en homologación (pruebas) y ese padrón no tiene CUITs reales. Probá con un CUIT de prueba (p. ej. 20-20179706-4) o cargá los datos a mano.`
        : `ARCA no encontró el CUIT ${cuit} en el padrón.`,
    );
  }
}

export interface ArcaPadronStatus {
  configured: boolean;
  env: AfipEnvironment;
  certAlias: string | null;
  cuit: string | null;
  certExpiresAt: Date | null;
  ticketExpiresAt: Date | null;
  lastCheckAt: Date | null;
  lastCheckOk: boolean | null;
  lastCheckMessage: string | null;
  queriesThisMonth: number;
}

function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

interface A5Impuesto {
  idImpuesto?: number | string;
  descripcionImpuesto?: string;
  estadoImpuesto?: string;
  periodo?: number | string;
}
interface A5Actividad {
  idActividad?: number | string;
  descripcionActividad?: string;
  orden?: number | string;
  periodo?: number | string;
}

/** Interpreta personaReturn de getPersona_v2 (constancia de inscripción).
 * Exportado para tests. */
export function mapConstancia(cuit: string, personaReturn: Record<string, unknown>): Omit<ArcaPadronPerson, 'fromCache'> {
  const general = (personaReturn['datosGenerales'] ?? {}) as Record<string, unknown>;
  const mono = personaReturn['datosMonotributo'] as Record<string, unknown> | undefined;
  const regimen = personaReturn['datosRegimenGeneral'] as Record<string, unknown> | undefined;

  const personType = general['tipoPersona'] === 'JURIDICA' ? 'JURIDICA' : 'FISICA';
  const name =
    (general['razonSocial'] as string | undefined) ??
    [general['apellido'], general['nombre']].filter(Boolean).join(' ').trim();

  const dom = general['domicilioFiscal'] as Record<string, unknown> | undefined;
  const fiscalAddress = dom
    ? [
        dom['direccion'],
        [dom['localidad'], dom['codPostal'] ? `(${dom['codPostal']})` : null].filter(Boolean).join(' '),
        dom['descripcionProvincia'],
      ]
        .map((part) => String(part ?? '').trim())
        .filter(Boolean)
        .join(', ')
    : null;

  const impuestosRg = toArray(regimen?.['impuesto'] as A5Impuesto | A5Impuesto[] | undefined);
  const impuestosMono = toArray(mono?.['impuesto'] as A5Impuesto | A5Impuesto[] | undefined);
  const activo = (i: A5Impuesto) => !i.estadoImpuesto || String(i.estadoImpuesto).toUpperCase() === 'AC';

  let ivaCondition: ArcaIvaCondition | null = null;
  let taxConditionLabel: string | null = null;
  const categoria = mono?.['categoriaMonotributo'] as Record<string, unknown> | string | undefined;
  if (mono && (categoria || impuestosMono.some(activo))) {
    ivaCondition = 'MONOTRIBUTO';
    const desc = typeof categoria === 'string' ? categoria : (categoria?.['descripcionCategoria'] as string | undefined);
    taxConditionLabel = desc ? `Monotributo (${desc})` : 'Monotributo';
  } else if (impuestosRg.some((i) => String(i.idImpuesto) === '30' && activo(i))) {
    ivaCondition = 'RESPONSABLE_INSCRIPTO';
    taxConditionLabel = 'Responsable Inscripto';
  } else if (impuestosRg.some((i) => /iva exento/i.test(String(i.descripcionImpuesto ?? '')) && activo(i))) {
    ivaCondition = 'EXENTO';
    taxConditionLabel = 'Exento';
  }

  const actividades = [
    ...toArray(regimen?.['actividad'] as A5Actividad | A5Actividad[] | undefined),
    ...toArray(mono?.['actividad'] as A5Actividad | A5Actividad[] | undefined),
  ];
  const principal =
    actividades.find((a) => String(a.orden) === '1') ?? actividades[0] ?? (mono?.['actividadMonotributista'] as A5Actividad | undefined);

  const periods = [...impuestosRg.filter(activo), ...impuestosMono.filter(activo), ...actividades]
    .map((x) => String(x.periodo ?? ''))
    .filter((p) => /^\d{6}/.test(p))
    .map((p) => p.slice(0, 6))
    .sort();
  const first = periods[0];

  return {
    cuit,
    personType,
    name,
    ivaCondition,
    taxConditionLabel,
    fiscalAddress,
    mainActivity: principal?.descripcionActividad
      ? `${principal.descripcionActividad}${principal.idActividad ? ` (${principal.idActividad})` : ''}`
      : null,
    activityStartMonth: first ? `${first.slice(0, 4)}-${first.slice(4, 6)}` : null,
  };
}

/**
 * Padrón de ARCA con el certificado de OPLEX (PlatformSettings), no el de
 * cada tenant - decisión del 2026-09-26: un tenant nuevo no tiene
 * certificado justo cuando carga sus datos, y así el alta por CUIT
 * funciona para todos. Usa PrismaService directo (tablas globales, sin RLS).
 * Caché por CUIT 30 días (arca_padron_cache); cuenta sólo las consultas que
 * llegan a ARCA.
 */
@Injectable()
export class ArcaPadronService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  private settings() {
    return this.prisma.platformSettings.upsert({
      where: { id: PLATFORM_SETTINGS_ID },
      create: { id: PLATFORM_SETTINGS_ID },
      update: {},
    });
  }

  private ticketStore(): WsaaTicketStore {
    const readAll = async (): Promise<Record<string, { token: string; sign: string; expiresAt: string }>> => {
      const row = await this.prisma.platformSettings.findUnique({
        where: { id: PLATFORM_SETTINGS_ID },
        select: { arcaPadronTicketsEncrypted: true },
      });
      if (!row?.arcaPadronTicketsEncrypted) return {};
      try {
        return JSON.parse(this.encryption.decrypt(row.arcaPadronTicketsEncrypted));
      } catch {
        return {};
      }
    };
    return {
      load: async (service) => {
        const entry = (await readAll())[service];
        return entry ? { token: entry.token, sign: entry.sign, expiresAt: new Date(entry.expiresAt) } : null;
      },
      save: async (service: string, ticket: WsaaTicket) => {
        const all = await readAll();
        all[service] = { token: ticket.token, sign: ticket.sign, expiresAt: ticket.expiresAt.toISOString() };
        await this.prisma.platformSettings.update({
          where: { id: PLATFORM_SETTINGS_ID },
          data: { arcaPadronTicketsEncrypted: this.encryption.encrypt(JSON.stringify(all)) },
        });
      },
    };
  }

  async lookup(rawCuit: string, options: { skipCache?: boolean } = {}): Promise<ArcaPadronPerson> {
    const cuit = rawCuit.replace(/\D/g, '');
    if (cuit.length !== 11) throw new Error('El CUIT tiene que tener 11 dígitos.');
    const settings = await this.settings();
    if (!settings.arcaPadronCertEncrypted || !settings.arcaPadronKeyEncrypted || !settings.arcaPadronCuit) {
      throw new ArcaPadronNotConfiguredError();
    }

    if (!options.skipCache) {
      const cached = await this.prisma.arcaPadronCache.findUnique({ where: { cuit } });
      const fresh = cached && cached.env === settings.arcaPadronEnv && Date.now() - cached.fetchedAt.getTime() < CACHE_DAYS * 86_400_000;
      if (fresh) return { ...(cached.data as unknown as Omit<ArcaPadronPerson, 'fromCache'>), fromCache: true };
    }

    const wsaa = new AfipWsaaClient({
      certPem: this.encryption.decrypt(settings.arcaPadronCertEncrypted),
      keyPem: this.encryption.decrypt(settings.arcaPadronKeyEncrypted),
      env: settings.arcaPadronEnv === 'PRODUCCION' ? 'produccion' : 'homologacion',
      ticketStore: this.ticketStore(),
    });
    const ticket = await wsaa.getTicket(SERVICE);
    const body = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:a5="http://a5.soap.ws.server.puc.sr/"><soapenv:Header/><soapenv:Body><a5:getPersona_v2><token>${ticket.token}</token><sign>${ticket.sign}</sign><cuitRepresentada>${settings.arcaPadronCuit}</cuitRepresentada><idPersona>${cuit}</idPersona></a5:getPersona_v2></soapenv:Body></soapenv:Envelope>`;

    let text: string;
    try {
      const response = await fetch(URL_BY_ENV[settings.arcaPadronEnv], {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' },
        body,
      });
      text = await response.text();
    } catch (err) {
      throw new Error(`No se pudo conectar con el padrón de ARCA: ${(err as Error).message}`);
    }
    await this.countQuery();

    const fault = text.match(/<faultstring>(.*?)<\/faultstring>/);
    if (fault) {
      if (/no existe persona/i.test(fault[1])) throw new ArcaPadronNotFoundError(cuit, settings.arcaPadronEnv);
      throw new Error(`El padrón de ARCA rechazó la consulta: ${fault[1]}`);
    }
    const parsed = xmlParser.parse(text);
    const personaReturn = parsed?.Envelope?.Body?.getPersona_v2Response?.personaReturn;
    if (!personaReturn?.datosGenerales) {
      const errorConstancia = personaReturn?.errorConstancia?.error;
      if (errorConstancia) throw new Error(`ARCA: ${toArray(errorConstancia).join('; ')}`);
      throw new ArcaPadronNotFoundError(cuit, settings.arcaPadronEnv);
    }
    const person = mapConstancia(cuit, personaReturn);
    await this.prisma.arcaPadronCache.upsert({
      where: { cuit },
      create: { cuit, env: settings.arcaPadronEnv, data: person as object },
      update: { env: settings.arcaPadronEnv, data: person as object, fetchedAt: new Date() },
    });
    return { ...person, fromCache: false };
  }

  private async countQuery() {
    const month = new Date().toISOString().slice(0, 7);
    const settings = await this.settings();
    await this.prisma.platformSettings.update({
      where: { id: PLATFORM_SETTINGS_ID },
      data:
        settings.arcaPadronQueriesMonth === month
          ? { arcaPadronQueriesCount: { increment: 1 } }
          : { arcaPadronQueriesMonth: month, arcaPadronQueriesCount: 1 },
    });
  }

  async getStatus(): Promise<ArcaPadronStatus> {
    const s = await this.settings();
    const month = new Date().toISOString().slice(0, 7);
    let ticketExpiresAt: Date | null = null;
    if (s.arcaPadronTicketsEncrypted) {
      try {
        const all = JSON.parse(this.encryption.decrypt(s.arcaPadronTicketsEncrypted));
        ticketExpiresAt = all[SERVICE] ? new Date(all[SERVICE].expiresAt) : null;
      } catch {
        ticketExpiresAt = null;
      }
    }
    return {
      configured: Boolean(s.arcaPadronCertEncrypted && s.arcaPadronKeyEncrypted && s.arcaPadronCuit),
      env: s.arcaPadronEnv,
      certAlias: s.arcaPadronCertAlias,
      cuit: s.arcaPadronCuit,
      certExpiresAt: s.arcaPadronCertExpiresAt,
      ticketExpiresAt,
      lastCheckAt: s.arcaPadronLastCheckAt,
      lastCheckOk: s.arcaPadronLastCheckOk,
      lastCheckMessage: s.arcaPadronLastCheckMessage,
      queriesThisMonth: s.arcaPadronQueriesMonth === month ? s.arcaPadronQueriesCount : 0,
    };
  }

  /** "Probar consulta" de Admin: siempre va a ARCA (sin caché) y guarda
   * el resultado para el estado del servicio. */
  async test(cuit: string): Promise<{ ok: boolean; message: string; person: ArcaPadronPerson | null; ms: number }> {
    const started = Date.now();
    let result: { ok: boolean; message: string; person: ArcaPadronPerson | null };
    try {
      const person = await this.lookup(cuit, { skipCache: true });
      result = {
        ok: true,
        message: `ARCA respondió: ${person.name}${person.taxConditionLabel ? ` · ${person.taxConditionLabel}` : ''}`,
        person,
      };
    } catch (err) {
      result = { ok: false, message: (err as Error).message, person: null };
    }
    await this.prisma.platformSettings.update({
      where: { id: PLATFORM_SETTINGS_ID },
      data: { arcaPadronLastCheckAt: new Date(), arcaPadronLastCheckOk: result.ok, arcaPadronLastCheckMessage: result.message },
    });
    return { ...result, ms: Date.now() - started };
  }

  /** Certificado de Oplex para el padrón (Admin). El ambiente se deduce
   * del emisor del certificado. Reemplaza el anterior y borra tickets. */
  async uploadCertificate(certPem: string, keyPem: string): Promise<ArcaPadronStatus> {
    if (detectAfipFileKind(certPem) !== 'CERTIFICATE') throw new Error('Ese archivo no es un certificado.');
    parseAndValidateAfipCertificate(certPem, keyPem);
    const info = inspectAfipCertificate(certPem);
    await this.settings();
    await this.prisma.platformSettings.update({
      where: { id: PLATFORM_SETTINGS_ID },
      data: {
        arcaPadronEnv: info.env,
        arcaPadronCertEncrypted: this.encryption.encrypt(certPem),
        arcaPadronKeyEncrypted: this.encryption.encrypt(keyPem),
        arcaPadronCertAlias: info.alias,
        arcaPadronCuit: info.cuit,
        arcaPadronCertExpiresAt: info.expiresAt,
        arcaPadronTicketsEncrypted: null,
        arcaPadronLastCheckAt: null,
        arcaPadronLastCheckOk: null,
        arcaPadronLastCheckMessage: null,
      },
    });
    return this.getStatus();
  }
}
