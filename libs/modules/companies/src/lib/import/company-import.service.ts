import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import {
  getTenantDb,
  getTenantId,
  getUserId,
  PrismaService,
  tenantContextStorage,
  withTenantContext,
  type CompanyIndustry,
  type CompanyRoleType,
} from '@plexo/database';
import {
  cellText,
  describeFile,
  detectHeaderRow,
  isBlank,
  loadUpload,
  parseFile,
  parseNumber,
  saveUpload,
  valueKey,
  type Cell,
  type ImportAnalysis,
} from '@plexo/spreadsheet-import';
import { SubscriptionService } from '@plexo/subscriptions';
import {
  AFIP_PADRON,
  AfipLookupError,
  AfipNotConfiguredError,
  AfipNotFoundError,
  type AfipPadronPort,
} from '../afip-padron.port.js';
import { assertCanManageAll } from '../company-permissions.js';
import { normalizeCuit } from '../cuit.js';
import {
  checkTaxId,
  COMPANY_FIELD_LABELS,
  COMPANY_REQUIRED_FIELDS,
  guessIndustry,
  guessTaxCondition,
  NO_CONDITION,
  sameCompanyName,
  splitPersonName,
  suggestCompanyMapping,
  TAX_CONDITIONS,
  type CompanyImportField,
  type CompanyImportFieldOrSkip,
} from './company-import-fields.js';

const PREVIEW_ROWS_PER_STATUS = 100;
const CHUNK_SIZE = 50;
const ARCA_PARALLEL = 3;
/** Tras tantos errores seguidos de ARCA se deja de verificar (está caído). */
const ARCA_MAX_CONSECUTIVE_ERRORS = 5;

export type CompanyImportRole = 'CUSTOMER' | 'SUPPLIER';

/** Lo que el usuario elige en los pasos "Archivo", "Columnas" y "Revisión". */
export interface CompanyImportOptions {
  mapping: CompanyImportFieldOrSkip[];
  roles: CompanyImportRole[];
  /** Empresa que ya existe: completar lo vacío, reemplazar con lo del
   * archivo, o dejarla como está. */
  onExisting: 'fill' | 'replace' | 'skip';
  verifyArca: boolean;
  /** Valor de condición de IVA del archivo (valueKey) -> condición de Oplex
   * o NO_CONDITION, para los que no se reconocieron o el usuario corrigió. */
  conditionValues?: Record<string, string>;
}

type RowStatus = 'new' | 'update' | 'skip' | 'error';

export interface ContactPlan {
  firstName: string;
  lastName: string | null;
  jobTitle: string | null;
  email: string | null;
  whatsapp: string | null;
}

export interface CompanyPlanRow {
  rowNumber: number;
  status: RowStatus;
  /** Errores: la fila no se importa. */
  messages: string[];
  /** Avisos que no frenan la fila. */
  warnings: string[];
  /** Lo que va a pasar ("se le agrega el rol de proveedor"). */
  notes: string[];
  name: string;
  taxId: string | null;
  taxIdDigits: string | null;
  taxCondition: string | null;
  fiscalAddress: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  grossIncomeNumber: string | null;
  industry: CompanyIndustry | null;
  creditLimit: number | null;
  contact: ContactPlan | null;
  existingId: string | null;
  /** Datos que se escriben en la empresa existente (según completar o reemplazar). */
  updates: Record<string, unknown>;
  addRoles: CompanyImportRole[];
  /** Otra fila del archivo con la misma empresa: ésta sólo suma su contacto. */
  mergedInto: number | null;
}

export interface ValueChoice {
  /** Clave con la que se manda la elección del usuario (conditionValues). */
  key: string;
  raw: string;
  count: number;
  resolved: string | null;
}

export interface ExistingCompany {
  id: string;
  name: string;
  taxIdDigits: string | null;
  roles: CompanyRoleType[];
  active: boolean;
  taxCondition: string | null;
  fiscalAddress: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  grossIncomeNumber: string | null;
  industry: CompanyIndustry | null;
  creditLimit: number;
  /** Nombres completos de sus contactos, en minúscula. */
  people: string[];
}

export interface CompanyRefs {
  companies: ExistingCompany[];
  quota: { planName: string; max: number; used: number } | null;
}

export type ArcaResult =
  | { status: 'found'; name: string; taxCondition: string | null; fiscalAddress: string | null }
  | { status: 'missing' }
  | { status: 'error' };

export interface CompanyImportPreview {
  counts: Record<RowStatus, number>;
  rows: CompanyPlanRow[];
  conditionValues: ValueChoice[];
  conditionOptions: string[];
  contacts: number;
  rolesAdded: number;
  missingRequired: string[];
  arca: ArcaProgress | null;
}

export interface ArcaProgress {
  total: number;
  done: number;
  /** Por qué no se puede verificar (sin certificado, ARCA caído). */
  unavailable: string | null;
}

export interface CompanyImportStatus {
  importId: string;
  state: 'running' | 'done' | 'failed';
  phase: 'arca' | 'saving';
  arcaDone: number;
  arcaTotal: number;
  total: number;
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  contacts: number;
  arcaVerified: number;
  arcaNameMismatch: number;
  error: string | null;
}

interface Job {
  status: CompanyImportStatus;
  tenantId: string;
  rows: CompanyPlanRow[];
}

interface ArcaCheck {
  tenantId: string;
  results: Map<string, ArcaResult>;
  pending: Set<string>;
  running: Promise<void> | null;
  unavailable: string | null;
}

/**
 * Importador de proveedores y clientes desde el archivo que el cliente ya
 * tiene (mockup aprobado 2026-10-04, https://claude.ai/artifact/XGmA41ZxMh2XcbSKj8cqu4).
 * Mismo recorrido que el de artículos: subir -> reconocer columnas ->
 * revisar -> importar en segundo plano. Saldos de cuenta corriente: otra
 * etapa (decisión del usuario).
 *
 * Da de alta directo con getTenantDb() en tandas, no con
 * CompaniesService.createCompany, por el cupo de clientes del plan: se
 * calcula una vez para todo el archivo y las filas que lo superan quedan
 * con error en la revisión, en vez de cortar a mitad de la importación.
 */
@Injectable()
export class CompanyImportService {
  private readonly logger = new Logger(CompanyImportService.name);
  private readonly jobs = new Map<string, Job>();
  private readonly arcaChecks = new Map<string, ArcaCheck>();

  constructor(
    @Inject(AFIP_PADRON) private readonly afipPadron: AfipPadronPort,
    private readonly subscriptionService: SubscriptionService,
    private readonly prisma: PrismaService,
  ) {}

  // ---------------------------------------------------------------------------
  // Paso 1: subir y analizar

  async analyze(fileName: string, buffer: Buffer): Promise<ImportAnalysis<CompanyImportField>> {
    const grid = await parseFile(fileName, buffer, 'empresas');
    const importId = await saveUpload(getTenantId(), fileName, buffer);
    return describeFile(importId, fileName, grid, suggestCompanyMapping);
  }

  // ---------------------------------------------------------------------------
  // Paso 2 y 3: armar el plan

  async preview(importId: string, options: CompanyImportOptions): Promise<CompanyImportPreview> {
    assertRoles(options);
    const { grid, headerRow } = await this.load(importId);
    const refs = await this.loadRefs(options);
    const check = options.verifyArca ? this.arcaCheck(importId) : null;
    const plan = buildCompanyPlan(grid, headerRow, options, refs, check?.results);
    if (check) this.startArca(importId, check, plan.cuits);

    const companies = plan.rows.filter((r) => r.mergedInto === null || r.status === 'error');
    const counts: Record<RowStatus, number> = { new: 0, update: 0, skip: 0, error: 0 };
    for (const row of companies) counts[row.status]++;
    const byStatus = (status: RowStatus) => plan.rows.filter((r) => r.status === status).slice(0, PREVIEW_ROWS_PER_STATUS);
    return {
      counts,
      rows: [...byStatus('error'), ...byStatus('update'), ...byStatus('new'), ...byStatus('skip')],
      conditionValues: plan.conditionValues,
      conditionOptions: [...TAX_CONDITIONS],
      contacts: plan.contacts,
      rolesAdded: plan.rolesAdded,
      missingRequired: COMPANY_REQUIRED_FIELDS.filter((f) => !options.mapping.includes(f)).map((f) => COMPANY_FIELD_LABELS[f]),
      arca: check ? { total: plan.cuits.length, done: plan.cuits.filter((c) => check.results.has(c)).length, unavailable: check.unavailable } : null,
    };
  }

  // ---------------------------------------------------------------------------
  // Paso 4: importar en segundo plano

  async start(importId: string, options: CompanyImportOptions): Promise<CompanyImportStatus> {
    assertRoles(options);
    const existing = this.jobs.get(importId);
    if (existing?.status.state === 'running') return existing.status;
    if (COMPANY_REQUIRED_FIELDS.some((f) => !options.mapping.includes(f))) {
      throw new BadRequestException('Falta la columna obligatoria: Razón social');
    }
    const { grid, headerRow } = await this.load(importId);
    const refs = await this.loadRefs(options);
    const check = options.verifyArca ? this.arcaCheck(importId) : null;
    const plan = buildCompanyPlan(grid, headerRow, options, refs, check?.results);
    if (check) this.startArca(importId, check, plan.cuits);

    const status: CompanyImportStatus = {
      importId,
      state: 'running',
      phase: check?.running ? 'arca' : 'saving',
      arcaDone: check ? plan.cuits.filter((c) => check.results.has(c)).length : 0,
      arcaTotal: check ? plan.cuits.length : 0,
      total: 0,
      processed: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      contacts: 0,
      arcaVerified: 0,
      arcaNameMismatch: 0,
      error: null,
    };
    const job: Job = { status, tenantId: getTenantId(), rows: plan.rows };
    this.jobs.set(importId, job);
    const context = { tenantId: getTenantId(), userId: getUserId() ?? undefined, role: tenantContextStorage.getStore()?.role };
    void this.run(job, grid, headerRow, options, refs, check, plan.cuits, context);
    return status;
  }

  status(importId: string): CompanyImportStatus {
    const job = this.jobs.get(importId);
    if (!job || job.tenantId !== getTenantId()) throw new NotFoundException('No hay una importación con ese número');
    const check = this.arcaChecks.get(importId);
    if (job.status.phase === 'arca' && check) {
      job.status.arcaDone = job.status.arcaTotal - [...check.pending].length;
    }
    return job.status;
  }

  /** Excel con las filas que no se importaron (y los avisos), para corregir
   * y volver a subir. Sirve antes (desde la revisión) o después de importar. */
  async errorsWorkbook(importId: string, options?: CompanyImportOptions): Promise<Buffer> {
    const job = this.jobs.get(importId);
    let rows = job?.tenantId === getTenantId() ? job.rows : null;
    if (!rows) {
      if (!options) throw new NotFoundException('No hay una importación con ese número');
      const { grid, headerRow } = await this.load(importId);
      rows = buildCompanyPlan(grid, headerRow, options, await this.loadRefs(options), this.arcaChecks.get(importId)?.results).rows;
    }
    const workbook = new ExcelJS.Workbook();
    const errors = workbook.addWorksheet('Con error');
    errors.columns = [
      { header: 'Fila del archivo', key: 'row', width: 14 },
      { header: 'Razón social', key: 'name', width: 36 },
      { header: 'CUIT', key: 'taxId', width: 16 },
      { header: 'Motivo', key: 'msg', width: 70 },
    ];
    for (const r of rows.filter((x) => x.status === 'error')) {
      errors.addRow({ row: r.rowNumber, name: r.name, taxId: r.taxId ?? '', msg: r.messages.join(' · ') });
    }
    const warned = rows.filter((x) => x.warnings.length > 0);
    if (warned.length) {
      const sheet = workbook.addWorksheet('Avisos');
      sheet.columns = [
        { header: 'Fila del archivo', key: 'row', width: 14 },
        { header: 'Razón social', key: 'name', width: 36 },
        { header: 'CUIT', key: 'taxId', width: 16 },
        { header: 'Aviso', key: 'msg', width: 70 },
      ];
      for (const r of warned) sheet.addRow({ row: r.rowNumber, name: r.name, taxId: r.taxId ?? '', msg: r.warnings.join(' · ') });
    }
    for (const sheet of workbook.worksheets) sheet.getRow(1).font = { bold: true };
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  /** Las empresas del tenant con las mismas columnas que lee el importador:
   * se corrigen en Excel y se vuelven a subir. Una fila por contacto. */
  async exportCompanies(role?: CompanyImportRole): Promise<Buffer> {
    const db = getTenantDb();
    const companies = await db.company.findMany({
      where: { active: true, ...(role ? { roles: { some: { role } } } : { roles: { some: { role: { in: ['CUSTOMER', 'SUPPLIER'] } } } }) },
      orderBy: { name: 'asc' },
    });
    const people = await db.person.findMany({ where: { companyId: { in: companies.map((c) => c.id) } }, orderBy: { createdAt: 'asc' } });
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(role === 'CUSTOMER' ? 'Clientes' : role === 'SUPPLIER' ? 'Proveedores' : 'Empresas');
    sheet.columns = EXPORT_COLUMNS;
    sheet.getRow(1).font = { bold: true };
    for (const c of companies) {
      const base = {
        name: c.name,
        taxId: c.taxId ?? '',
        taxCondition: c.taxCondition ?? '',
        address: c.fiscalAddress ?? '',
        phone: c.phone ?? '',
        email: c.email ?? '',
        website: c.website ?? '',
        grossIncome: c.grossIncomeNumber ?? '',
        industry: c.industry ? INDUSTRY_LABELS[c.industry] : '',
        creditLimit: Number(c.creditLimit) || '',
      };
      const own = people.filter((p) => p.companyId === c.id);
      if (own.length === 0) sheet.addRow(base);
      for (const p of own) {
        sheet.addRow({
          ...base,
          contact: [p.firstName, p.lastName].filter(Boolean).join(' '),
          contactJob: p.jobTitle ?? '',
          contactEmail: p.email ?? '',
          contactPhone: p.whatsapp ?? '',
        });
      }
    }
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async generateTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Empresas');
    sheet.columns = EXPORT_COLUMNS;
    sheet.getRow(1).font = { bold: true };
    sheet.addRow({
      name: 'Bulonera del Sur SRL (ejemplo)',
      taxId: '30-12345678-1',
      taxCondition: 'Responsable Inscripto',
      address: 'Av. Mitre 1234, Avellaneda, Buenos Aires',
      phone: '011 4201-0000',
      email: 'ventas@ejemplo.com.ar',
      website: 'www.ejemplo.com.ar',
      grossIncome: '901-123456-7',
      industry: 'Comercio',
      creditLimit: '',
      contact: 'Carlos Gómez',
      contactJob: 'Vendedor',
      contactEmail: 'carlos@ejemplo.com.ar',
      contactPhone: '11 5000-0000',
    });
    const help = workbook.addWorksheet('Cómo completarla');
    help.columns = [
      { header: 'Columna', key: 'col', width: 26 },
      { header: 'Qué va', key: 'what', width: 90 },
    ];
    help.getRow(1).font = { bold: true };
    [
      ['Razón social', 'Obligatoria.'],
      ['CUIT', 'Con o sin guiones. Para clientes consumidor final se acepta el DNI. Si ya existe en Oplex, la empresa se completa en vez de duplicarse.'],
      ['Condición de IVA', 'Responsable Inscripto, Monotributo, Exento o Consumidor Final (también sirve RI, Monot., EX, CF). Vacía: la completa ARCA si se verifica.'],
      ['Rubro', 'Comercio, Servicios, Industria, Construcción, Agro, Tecnología, Salud, Educación, Gastronomía, Transporte, Inmobiliario u Otro.'],
      ['Límite de crédito', 'Sólo para clientes.'],
      ['Contacto', 'Nombre y apellido de una persona. Para cargar varios contactos de la misma empresa, repetí la fila con el mismo CUIT y otro contacto.'],
    ].forEach(([col, what]) => help.addRow({ col, what }));
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  // ---------------------------------------------------------------------------

  private async run(
    job: Job,
    grid: Cell[][],
    headerRow: number,
    options: CompanyImportOptions,
    refs: CompanyRefs,
    check: ArcaCheck | null,
    cuits: string[],
    context: { tenantId: string; userId?: string; role?: Parameters<typeof withTenantContext>[4] },
  ): Promise<void> {
    try {
      // Primero se termina de verificar en ARCA, así lo que completa ARCA
      // (condición de IVA, domicilio) entra en la misma importación.
      if (check?.running) {
        await check.running;
      }
      const plan = check ? buildCompanyPlan(grid, headerRow, options, refs, check.results) : null;
      const rows = plan ? plan.rows : job.rows;
      job.rows = rows;
      job.status.phase = 'saving';
      if (check) {
        job.status.arcaDone = cuits.filter((c) => check.results.has(c)).length;
        job.status.arcaVerified = cuits.filter((c) => check.results.get(c)?.status === 'found').length;
        job.status.arcaNameMismatch = rows.filter((r) => r.warnings.some((w) => w.startsWith('En ARCA figura'))).length;
      }

      const groups: CompanyPlanRow[][] = [];
      const byRow = new Map<number, CompanyPlanRow[]>();
      for (const row of rows) {
        if (row.status === 'error' || row.status === 'skip') continue;
        if (row.mergedInto !== null) {
          byRow.get(row.mergedInto)?.push(row);
          continue;
        }
        const group = [row];
        byRow.set(row.rowNumber, group);
        groups.push(group);
      }
      job.status.total = groups.length;
      job.status.skipped = rows.filter((r) => r.status === 'skip' && r.mergedInto === null).length;
      job.status.failed = rows.filter((r) => r.status === 'error').length;

      for (let i = 0; i < groups.length; i += CHUNK_SIZE) {
        const chunk = groups.slice(i, i + CHUNK_SIZE);
        await withTenantContext(
          this.prisma,
          context.tenantId,
          async () => {
            for (const group of chunk) {
              try {
                const contacts = await this.saveGroup(group, options);
                if (group[0].status === 'update') job.status.updated++;
                else job.status.created++;
                job.status.contacts += contacts;
              } catch (err) {
                for (const row of group) {
                  row.status = 'error';
                  row.messages = [`No se pudo guardar: ${(err as Error).message}`];
                }
                job.status.failed += group.length;
              }
              job.status.processed++;
            }
          },
          context.userId,
          context.role,
          120_000,
        );
      }
      job.status.state = 'done';
    } catch (err) {
      this.logger.error(`Importación de empresas ${job.status.importId}: ${(err as Error).message}`);
      job.status.state = 'failed';
      job.status.error = 'La importación se cortó. Lo importado hasta ahora quedó guardado; volvé a subir el archivo para completar el resto.';
    }
  }

  /** Guarda una empresa (y los contactos de sus filas repetidas). Devuelve
   * cuántos contactos cargó. */
  private async saveGroup(group: CompanyPlanRow[], options: CompanyImportOptions): Promise<number> {
    const db = getTenantDb();
    const tenantId = getTenantId();
    const first = group[0];
    const isCustomer = options.roles.includes('CUSTOMER');
    let companyId: string;
    if (first.status === 'new') {
      const created = await db.company.create({
        data: {
          tenantId,
          name: first.name,
          taxId: first.taxId,
          taxCondition: first.taxCondition,
          fiscalAddress: first.fiscalAddress,
          phone: first.phone,
          email: first.email,
          website: first.website,
          grossIncomeNumber: first.grossIncomeNumber,
          industry: first.industry,
          creditLimit: isCustomer ? (first.creditLimit ?? 0) : 0,
          roles: { createMany: { data: options.roles.map((role) => ({ tenantId, role })) } },
        },
      });
      companyId = created.id;
    } else {
      companyId = first.existingId as string;
      if (Object.keys(first.updates).length) await db.company.update({ where: { id: companyId }, data: first.updates });
      if (first.addRoles.length) {
        await db.companyRole.createMany({
          data: first.addRoles.map((role) => ({ tenantId, companyId, role })),
          skipDuplicates: true,
        });
      }
    }

    const existingPeople = first.status === 'update' ? await db.person.findMany({ where: { companyId }, select: { firstName: true, lastName: true } }) : [];
    const known = new Set(existingPeople.map((p) => fullName(p.firstName, p.lastName)));
    let contacts = 0;
    for (const row of group) {
      const c = row.contact;
      if (!c) continue;
      const key = fullName(c.firstName, c.lastName);
      if (known.has(key)) continue;
      known.add(key);
      await db.person.create({
        data: { tenantId, companyId, firstName: c.firstName, lastName: c.lastName, jobTitle: c.jobTitle, email: c.email, whatsapp: c.whatsapp },
      });
      contacts++;
    }
    return contacts;
  }

  private async load(importId: string): Promise<{ grid: Cell[][]; headerRow: number }> {
    const { fileName, buffer } = await loadUpload(getTenantId(), importId);
    const grid = await parseFile(fileName, buffer, 'empresas');
    return { grid, headerRow: detectHeaderRow(grid, suggestCompanyMapping) };
  }

  private async loadRefs(options: CompanyImportOptions): Promise<CompanyRefs> {
    const db = getTenantDb();
    const companies = await db.company.findMany({ include: { roles: { select: { role: true } } } });
    const people = await db.person.findMany({ select: { companyId: true, firstName: true, lastName: true } });
    const quota = options.roles.includes('CUSTOMER') ? await this.subscriptionService.getClientQuota() : null;
    return {
      quota,
      companies: companies.map((c) => ({
        id: c.id,
        name: c.name,
        taxIdDigits: c.taxId ? normalizeCuit(c.taxId) || null : null,
        roles: c.roles.map((r) => r.role),
        active: c.active,
        taxCondition: c.taxCondition,
        fiscalAddress: c.fiscalAddress,
        phone: c.phone,
        email: c.email,
        website: c.website,
        grossIncomeNumber: c.grossIncomeNumber,
        industry: c.industry,
        creditLimit: Number(c.creditLimit),
        people: people.filter((p) => p.companyId === c.id).map((p) => fullName(p.firstName, p.lastName)),
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // Verificación con ARCA (en segundo plano, una por CUIT, con caché de 30
  // días en ArcaPadronService)

  private arcaCheck(importId: string): ArcaCheck {
    let check = this.arcaChecks.get(importId);
    if (!check || check.tenantId !== getTenantId()) {
      check = { tenantId: getTenantId(), results: new Map(), pending: new Set(), running: null, unavailable: null };
      this.arcaChecks.set(importId, check);
    }
    return check;
  }

  private startArca(importId: string, check: ArcaCheck, cuits: string[]): void {
    if (check.unavailable) return;
    for (const cuit of cuits) if (!check.results.has(cuit)) check.pending.add(cuit);
    if (check.running || check.pending.size === 0) return;
    check.running = this.verifyPending(check).finally(() => {
      check.running = null;
    });
    this.logger.log(`Importación ${importId}: verificando ${check.pending.size} CUIT en ARCA`);
  }

  private async verifyPending(check: ArcaCheck): Promise<void> {
    let consecutiveErrors = 0;
    const one = async (cuit: string) => {
      try {
        const data = await this.afipPadron.lookup(cuit);
        check.results.set(
          cuit,
          data ? { status: 'found', name: data.name, taxCondition: data.taxCondition, fiscalAddress: data.fiscalAddress } : { status: 'missing' },
        );
        consecutiveErrors = 0;
      } catch (err) {
        if (err instanceof AfipNotConfiguredError) {
          check.unavailable = 'La verificación con ARCA no está disponible en este servidor.';
        } else if (err instanceof AfipNotFoundError) {
          check.results.set(cuit, { status: 'missing' });
        } else {
          check.results.set(cuit, { status: 'error' });
          if (++consecutiveErrors >= ARCA_MAX_CONSECUTIVE_ERRORS) {
            check.unavailable = 'ARCA no responde en este momento: se importa sin verificar.';
          }
          if (!(err instanceof AfipLookupError)) this.logger.warn(`ARCA ${cuit}: ${(err as Error).message}`);
        }
      }
      check.pending.delete(cuit);
    };
    // La primera sola: saca el ticket de acceso a ARCA una sola vez antes de
    // consultar en paralelo.
    const queue = [...check.pending];
    const first = queue.shift();
    if (first) await one(first);
    const worker = async () => {
      while (queue.length && !check.unavailable) {
        const cuit = queue.shift();
        if (cuit) await one(cuit);
      }
    };
    await Promise.all(Array.from({ length: ARCA_PARALLEL }, worker));
    if (check.unavailable) check.pending.clear();
  }
}

function assertRoles(options: CompanyImportOptions): void {
  if (!options.roles?.length) throw new BadRequestException('Elegí si las empresas son proveedores, clientes o las dos cosas');
  assertCanManageAll(options.roles, 'importar');
}

function fullName(firstName: string, lastName: string | null): string {
  return [firstName, lastName].filter(Boolean).join(' ').toLowerCase();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const INDUSTRY_LABELS: Record<CompanyIndustry, string> = {
  COMERCIO: 'Comercio',
  SERVICIOS: 'Servicios',
  INDUSTRIA: 'Industria',
  CONSTRUCCION: 'Construcción',
  AGRO: 'Agro',
  TECNOLOGIA: 'Tecnología',
  SALUD: 'Salud',
  EDUCACION: 'Educación',
  GASTRONOMIA: 'Gastronomía',
  TRANSPORTE: 'Transporte',
  INMOBILIARIO: 'Inmobiliario',
  OTRO: 'Otro',
};

const EXPORT_COLUMNS: { header: string; key: CompanyImportField; width: number }[] = [
  { header: COMPANY_FIELD_LABELS.name, key: 'name', width: 36 },
  { header: COMPANY_FIELD_LABELS.taxId, key: 'taxId', width: 16 },
  { header: COMPANY_FIELD_LABELS.taxCondition, key: 'taxCondition', width: 24 },
  { header: COMPANY_FIELD_LABELS.address, key: 'address', width: 40 },
  { header: COMPANY_FIELD_LABELS.phone, key: 'phone', width: 16 },
  { header: COMPANY_FIELD_LABELS.email, key: 'email', width: 28 },
  { header: COMPANY_FIELD_LABELS.website, key: 'website', width: 22 },
  { header: COMPANY_FIELD_LABELS.grossIncome, key: 'grossIncome', width: 18 },
  { header: COMPANY_FIELD_LABELS.industry, key: 'industry', width: 14 },
  { header: COMPANY_FIELD_LABELS.creditLimit, key: 'creditLimit', width: 16 },
  { header: COMPANY_FIELD_LABELS.contact, key: 'contact', width: 24 },
  { header: COMPANY_FIELD_LABELS.contactJob, key: 'contactJob', width: 18 },
  { header: COMPANY_FIELD_LABELS.contactEmail, key: 'contactEmail', width: 28 },
  { header: COMPANY_FIELD_LABELS.contactPhone, key: 'contactPhone', width: 18 },
];

const COMPANY_DATA_FIELDS = ['taxId', 'taxCondition', 'fiscalAddress', 'phone', 'email', 'website', 'grossIncomeNumber', 'industry'] as const;

/** Lo que cambia en una empresa existente según "completar lo vacío" o
 * "reemplazar". Lo vacío del archivo nunca borra nada. */
function companyChanges(row: CompanyPlanRow, options: CompanyImportOptions, existing: ExistingCompany): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const field of COMPANY_DATA_FIELDS) {
    const value = row[field];
    if (value === null || value === '') continue;
    const current = existing[field === 'taxId' ? 'taxIdDigits' : field];
    if (options.onExisting === 'fill' && current) continue;
    if (field === 'taxId' ? current === row.taxIdDigits : current === value) continue;
    data[field] = value;
  }
  if (options.roles.includes('CUSTOMER') && row.creditLimit !== null) {
    const current = existing.creditLimit;
    if (!(options.onExisting === 'fill' && current > 0) && current !== row.creditLimit) data['creditLimit'] = row.creditLimit;
  }
  return data;
}

/**
 * El plan de la importación: qué se crea, qué se completa, qué falla y por
 * qué. Puro (sin base de datos): recibe las empresas existentes y lo que ya
 * respondió ARCA.
 */
export function buildCompanyPlan(
  grid: Cell[][],
  headerRow: number,
  options: CompanyImportOptions,
  refs: CompanyRefs,
  arca?: Map<string, ArcaResult>,
) {
  const col = (field: CompanyImportField) => options.mapping.indexOf(field);
  const text = (row: Cell[], field: CompanyImportField) => {
    const i = col(field);
    return i < 0 ? null : cellText(row[i]) || null;
  };
  const isCustomer = options.roles.includes('CUSTOMER');
  const byTaxId = new Map(refs.companies.filter((c) => c.taxIdDigits).map((c) => [c.taxIdDigits as string, c]));
  const byName = new Map(refs.companies.map((c) => [valueKey(c.name), c]));
  const conditionCounts = new Map<string, { raw: string; count: number }>();
  const firstByKey = new Map<string, CompanyPlanRow>();
  const rows: CompanyPlanRow[] = [];
  const cuits = new Set<string>();

  grid.slice(headerRow + 1).forEach((cells, offset) => {
    if (isBlank(cells)) return;
    const messages: string[] = [];
    const warnings: string[] = [];
    const notes: string[] = [];

    const name = text(cells, 'name') ?? '';
    if (!name) messages.push('Falta la razón social');

    let taxId: string | null = null;
    let taxIdDigits: string | null = null;
    let isCuit = false;
    const rawTaxId = text(cells, 'taxId');
    if (rawTaxId) {
      const checked = checkTaxId(rawTaxId);
      if (checked.kind === 'invalid') messages.push(checked.message);
      else {
        taxId = checked.value;
        taxIdDigits = checked.digits;
        isCuit = checked.kind === 'cuit';
      }
    }

    let taxCondition: string | null = null;
    const rawCondition = text(cells, 'taxCondition');
    if (rawCondition) {
      const key = valueKey(rawCondition);
      const entry = conditionCounts.get(key) ?? { raw: rawCondition, count: 0 };
      entry.count++;
      conditionCounts.set(key, entry);
      const resolved = options.conditionValues?.[key] ?? guessTaxCondition(rawCondition);
      if (!resolved) messages.push(`Condición de IVA "${rawCondition}" no reconocida: elegí a qué corresponde`);
      else if (resolved !== NO_CONDITION) taxCondition = resolved;
    }

    let email = text(cells, 'email');
    if (email && !EMAIL_RE.test(email)) {
      warnings.push(`El email "${email}" no es válido: se importa sin email`);
      email = null;
    }

    let industry: CompanyIndustry | null = null;
    const rawIndustry = text(cells, 'industry');
    if (rawIndustry) {
      industry = guessIndustry(rawIndustry);
      if (!industry) warnings.push(`Rubro "${rawIndustry}" no reconocido: se importa sin rubro`);
    }

    let creditLimit: number | null = null;
    const rawCredit = text(cells, 'creditLimit');
    if (rawCredit && isCustomer) {
      creditLimit = parseNumber(rawCredit);
      if (creditLimit === null || creditLimit < 0) {
        warnings.push(`El límite de crédito "${rawCredit}" no es un número: se importa sin límite`);
        creditLimit = null;
      }
    }

    let contact: ContactPlan | null = null;
    const contactName = text(cells, 'contact');
    const contactEmail = text(cells, 'contactEmail');
    const contactPhone = text(cells, 'contactPhone');
    if (contactName) {
      const { firstName, lastName } = splitPersonName(contactName);
      const validEmail = contactEmail && EMAIL_RE.test(contactEmail) ? contactEmail : null;
      if (contactEmail && !validEmail) warnings.push(`El email del contacto "${contactEmail}" no es válido: se carga sin email`);
      contact = { firstName, lastName, jobTitle: text(cells, 'contactJob'), email: validEmail, whatsapp: contactPhone };
    } else if (contactEmail || contactPhone) {
      warnings.push('Hay datos de contacto sin nombre: el contacto no se carga');
    }

    const row: CompanyPlanRow = {
      rowNumber: headerRow + 2 + offset,
      status: 'new',
      messages,
      warnings,
      notes,
      name,
      taxId,
      taxIdDigits,
      taxCondition,
      fiscalAddress: text(cells, 'address'),
      phone: text(cells, 'phone'),
      email,
      website: text(cells, 'website'),
      grossIncomeNumber: text(cells, 'grossIncome'),
      industry,
      creditLimit,
      contact,
      existingId: null,
      updates: {},
      addRoles: [],
      mergedInto: null,
    };
    rows.push(row);
    if (messages.length) {
      row.status = 'error';
      return;
    }

    // La misma empresa más de una vez en el archivo: suma contactos.
    const key = taxIdDigits ?? `nombre:${valueKey(name)}`;
    const first = firstByKey.get(key);
    if (first) {
      row.mergedInto = first.rowNumber;
      if (!sameCompanyName(first.name, name)) {
        warnings.push(`Mismo CUIT que la fila ${first.rowNumber} con otra razón social: vale la de la fila ${first.rowNumber}`);
      }
      if (contact) notes.push(`Misma empresa que la fila ${first.rowNumber}: se suma como otro contacto`);
      else {
        notes.push(`Repetida (fila ${first.rowNumber}): no se vuelve a importar`);
        row.status = 'skip';
      }
      return;
    }
    firstByKey.set(key, row);

    // ARCA: completa lo que falte y avisa si no coincide.
    if (isCuit && taxIdDigits) {
      if (options.verifyArca) cuits.add(taxIdDigits);
      const result = arca?.get(taxIdDigits);
      if (result?.status === 'found') {
        if (!row.taxCondition && result.taxCondition) {
          row.taxCondition = result.taxCondition;
          notes.push(`Condición de IVA de ARCA: ${result.taxCondition}`);
        }
        if (!row.fiscalAddress && result.fiscalAddress) row.fiscalAddress = result.fiscalAddress;
        if (!sameCompanyName(name, result.name)) warnings.push(`En ARCA figura como "${result.name}". Se importa con el nombre del archivo`);
      } else if (result?.status === 'missing') {
        warnings.push('ARCA no tiene datos de ese CUIT');
      }
    } else if (!taxIdDigits) {
      warnings.push(isCustomer ? 'Sin CUIT: no se puede verificar en ARCA ni facturarle A' : 'Sin CUIT: no se puede verificar en ARCA');
    }

    // ¿Ya existe en Oplex? Por CUIT, o por razón social si a alguna de las
    // dos le falta el CUIT (como los proveedores que crea el importador de
    // artículos, que sólo tienen nombre).
    let existing = taxIdDigits ? byTaxId.get(taxIdDigits) : undefined;
    if (!existing) {
      const sameName = byName.get(valueKey(name));
      if (sameName && (!taxIdDigits || !sameName.taxIdDigits)) existing = sameName;
    }
    if (!existing) return;

    row.existingId = existing.id;
    if (options.onExisting === 'skip') {
      row.status = 'skip';
      notes.push('Ya existe en Oplex: se deja como está');
      return;
    }
    row.addRoles = options.roles.filter((r) => !existing.roles.includes(r));
    const changes = companyChanges(row, options, existing);
    row.updates = changes;
    const newContact = contact && !existing.people.includes(fullName(contact.firstName, contact.lastName));
    if (!Object.keys(changes).length && !row.addRoles.length && !newContact) {
      row.status = 'skip';
      notes.push('Ya existe en Oplex y no hay nada para completar');
      return;
    }
    row.status = 'update';
    if (!existing.taxIdDigits && taxIdDigits) notes.push('Ya existía sin CUIT: se completan sus datos');
    if (row.addRoles.length) {
      const had = existing.roles.includes('CUSTOMER') ? 'cliente' : existing.roles.includes('SUPPLIER') ? 'proveedor' : 'sucursal';
      notes.push(`Ya es ${had}: se le agrega el rol de ${row.addRoles.map((r) => (r === 'CUSTOMER' ? 'cliente' : 'proveedor')).join(' y ')}`);
    }
    if (!existing.active) warnings.push('Está desactivada en Oplex: se completa pero sigue desactivada');
  });

  // Las filas repetidas siguen a la de su empresa (si ésa tiene error, ésta también).
  const byNumber = new Map(rows.map((r) => [r.rowNumber, r]));
  for (const row of rows) {
    if (row.mergedInto === null || row.status === 'skip') continue;
    const first = byNumber.get(row.mergedInto);
    if (!first) continue;
    if (first.status === 'error') {
      row.status = 'error';
      row.messages.push(`La empresa de la fila ${first.rowNumber} tiene errores`);
    } else if (first.status === 'skip') {
      row.status = 'skip';
    } else {
      row.status = first.status;
    }
  }

  // Cupo de clientes del plan, en el orden del archivo.
  if (refs.quota && isCustomer) {
    let used = refs.quota.used;
    for (const row of rows) {
      if (row.mergedInto !== null) continue;
      const addsCustomer = row.status === 'new' || (row.status === 'update' && row.addRoles.includes('CUSTOMER'));
      if (!addsCustomer) continue;
      if (used >= refs.quota.max) {
        row.status = 'error';
        row.messages.push(`Supera el límite de clientes de tu plan (${refs.quota.planName}: ${refs.quota.max})`);
        for (const other of rows) if (other.mergedInto === row.rowNumber) other.status = 'error';
      } else used++;
    }
  }

  const live = rows.filter((r) => r.status === 'new' || r.status === 'update');
  const companiesExisting = new Map(refs.companies.map((c) => [c.id, c]));
  const contacts = live.filter((r) => {
    if (!r.contact) return false;
    const owner = r.mergedInto === null ? r : byNumber.get(r.mergedInto);
    const existing = owner?.existingId ? companiesExisting.get(owner.existingId) : undefined;
    return !existing?.people.includes(fullName(r.contact.firstName, r.contact.lastName));
  }).length;

  return {
    rows,
    cuits: [...cuits],
    contacts,
    rolesAdded: live.filter((r) => r.mergedInto === null && r.status === 'update' && r.addRoles.length > 0).length,
    conditionValues: [...conditionCounts.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([key, { raw, count }]) => ({ key, raw, count, resolved: options.conditionValues?.[key] ?? guessTaxCondition(raw) })),
  };
}
