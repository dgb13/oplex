import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { getTenantDb, getTenantId } from '@plexo/database';
import type {
  AfipEnvironment,
  EmailSenderMode,
  ReminderTone,
  TenantSettings,
  TenantTaxCondition,
} from '@plexo/database';
import { EncryptionService } from '@plexo/encryption';
import type { DomainRecords } from 'resend';
import {
  detectAfipFileKind,
  generateAfipKeyAndCsr,
  inspectAfipCertificate,
  parseAndValidateAfipCertificate,
  type AfipFileKind,
} from './afip-certificate.js';
import type { UpdateTenantInfoDto } from './dto/update-tenant-info.dto.js';
import type { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto.js';
import type { UploadAfipCertificateDto } from './dto/upload-afip-certificate.dto.js';
import { RESEND_DOMAIN_CLIENT, type ResendDomainsClient } from './resend-domain-client.provider.js';

export interface TenantSettingsView {
  arReminderIntervalDays: number | null;
  emailSenderMode: EmailSenderMode;
  emailFromName: string | null;
  emailFromLocalPart: string | null;
  emailCustomDomain: string | null;
  domainStatus: string | null;
  reminderTone: ReminderTone;
  reminderCcEmail: string | null;
  withholdingAgentIncomeTax: boolean;
  withholdingAgentVat: boolean;
  withholdingAgentGrossIncome: boolean;
  afipEnv: AfipEnvironment;
  // Never the decrypted cert/key themselves - just whether one is on file,
  // so the frontend can show "certificado cargado" vs. an upload prompt.
  afipConfigured: boolean;
  afipCertExpiresAt: Date | null;
  // Nombre ("nombre simbólico" en WSASS) del certificado cargado.
  afipCertAlias: string | null;
  // Clave generada por Oplex esperando el certificado de ARCA: el CSR (es
  // público) y su nombre, para volver a descargarlo/copiarlo.
  afipHasPendingKey: boolean;
  afipPendingCsr: string | null;
  afipPendingAlias: string | null;
  // Resultado del último "Probar conexión con ARCA" (ver ArcaConnectionService).
  afipLastCheckAt: Date | null;
  afipLastCheckOk: boolean | null;
  afipLastCheckMessage: string | null;
  // Condición IVA propia del tenant - null hasta que el usuario la
  // configure a mano en Preferencias. Alimenta resolveDocumentLetter en el
  // frontend (letra A/B/C sugerida/forzada al emitir factura).
  ownTaxCondition: TenantTaxCondition | null;
  // Datos fiscales del emisor que van en el PDF de Facturación (ver
  // @plexo/invoicing/pdf) - null hasta que el usuario los cargue en
  // Preferencias, el PDF simplemente omite la línea si no están.
  fiscalAddress: string | null;
  grossIncomeNumber: string | null;
  activityStartDate: Date | null;
  // Sugerencia genérica de % de remarca - ver el comentario del campo en
  // el schema. Usado por Inventario para pre-completar el precio de venta
  // cuando el Article en cuestión no tiene su propio markupPercent.
  defaultMarkupPercent: number | null;
  // Tenant.taxId (the tenant's OWN CUIT - who the AFIP certificate is
  // registered under), surfaced here because Preferencias/AFIP is the only
  // screen that needs to show/edit it today - see updateTenantInfo. Not a
  // TenantSettings column; it lives on Tenant, joined in on every read.
  tenantTaxId: string | null;
}

export interface DomainRegistrationResult {
  status: string;
  records: DomainRecords[];
}

@Injectable()
export class TenantSettingsService {
  constructor(
    @Inject(RESEND_DOMAIN_CLIENT) private readonly domains: ResendDomainsClient | null,
    private readonly encryption: EncryptionService,
  ) {}

  /** No row yet (tenant never visited Preferencias) reads as "everything
   * off" - matches the behavior that existed before this feature, so a
   * tenant that never opens this screen sees nothing change. The row is
   * only created lazily, on the first PATCH. */
  async getSettings(): Promise<TenantSettingsView> {
    const tenantId = getTenantId();
    const db = getTenantDb();
    const [row, tenant] = await Promise.all([
      db.tenantSettings.findUnique({ where: { tenantId } }),
      db.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
    ]);
    // Certificados subidos antes de que existiera afipCertAlias: se completa
    // una vez leyéndolo del propio certificado (el nombre no es secreto).
    if (row?.afipCertEncrypted && !row.afipCertAlias) {
      try {
        const alias = inspectAfipCertificate(this.encryption.decrypt(row.afipCertEncrypted)).alias;
        if (alias) {
          const updated = await db.tenantSettings.update({ where: { tenantId }, data: { afipCertAlias: alias } });
          return this.toView(updated, tenant.taxId);
        }
      } catch {
        // Si no se puede leer, se muestra sin nombre.
      }
    }
    return this.toView(row, tenant.taxId);
  }

  private async getTenantTaxId(): Promise<string | null> {
    const tenant = await getTenantDb().tenant.findUniqueOrThrow({ where: { id: getTenantId() } });
    return tenant.taxId;
  }

  /** The tenant's own CUIT - lives on Tenant, not TenantSettings, but this
   * is the only screen that edits it, so it's exposed through this service
   * rather than adding a whole separate module for one field. */
  async updateTenantInfo(dto: UpdateTenantInfoDto): Promise<TenantSettingsView> {
    const tenantId = getTenantId();
    const db = getTenantDb();
    await db.tenant.update({ where: { id: tenantId }, data: { taxId: dto.taxId } });
    const row = await db.tenantSettings.findUnique({ where: { tenantId } });
    return this.toView(row, dto.taxId);
  }

  private toView(row: TenantSettings | null, tenantTaxId: string | null): TenantSettingsView {
    return {
      arReminderIntervalDays: row?.arReminderIntervalDays ?? null,
      emailSenderMode: row?.emailSenderMode ?? 'SHARED',
      emailFromName: row?.emailFromName ?? null,
      emailFromLocalPart: row?.emailFromLocalPart ?? null,
      emailCustomDomain: row?.emailCustomDomain ?? null,
      domainStatus: row?.domainStatus ?? null,
      reminderTone: row?.reminderTone ?? 'NEUTRAL',
      reminderCcEmail: row?.reminderCcEmail ?? null,
      withholdingAgentIncomeTax: row?.withholdingAgentIncomeTax ?? false,
      withholdingAgentVat: row?.withholdingAgentVat ?? false,
      withholdingAgentGrossIncome: row?.withholdingAgentGrossIncome ?? false,
      afipEnv: row?.afipEnv ?? 'HOMOLOGACION',
      // Mirrors AfipCredentialsService.getCurrent()'s own "configured"
      // check exactly (cert+key AND the tenant's own CUIT) - otherwise this
      // flag could say "listo" while WSFE calls still fail for missing the
      // CUIT half of it.
      afipConfigured: Boolean(row?.afipCertEncrypted && row?.afipKeyEncrypted && tenantTaxId),
      afipCertExpiresAt: row?.afipCertExpiresAt ?? null,
      afipCertAlias: row?.afipCertAlias ?? null,
      afipHasPendingKey: Boolean(row?.afipPendingKeyEncrypted),
      afipPendingCsr: row?.afipPendingCsr ?? null,
      afipPendingAlias: row?.afipPendingAlias ?? null,
      afipLastCheckAt: row?.afipLastCheckAt ?? null,
      afipLastCheckOk: row?.afipLastCheckOk ?? null,
      afipLastCheckMessage: row?.afipLastCheckMessage ?? null,
      ownTaxCondition: row?.ownTaxCondition ?? null,
      fiscalAddress: row?.fiscalAddress ?? null,
      grossIncomeNumber: row?.grossIncomeNumber ?? null,
      activityStartDate: row?.activityStartDate ?? null,
      defaultMarkupPercent: row?.defaultMarkupPercent?.toNumber() ?? null,
      tenantTaxId,
    };
  }

  /** emailCustomDomain/resendDomainId/domainStatus are never touched here on
   * purpose - see registerCustomDomain/refreshDomainStatus below. */
  async updateSettings(dto: UpdateTenantSettingsDto): Promise<TenantSettingsView> {
    const tenantId = getTenantId();
    const row = await getTenantDb().tenantSettings.upsert({
      where: { tenantId },
      create: {
        tenantId,
        arReminderIntervalDays: dto.arReminderIntervalDays ?? null,
        emailSenderMode: dto.emailSenderMode,
        emailFromName: dto.emailFromName,
        emailFromLocalPart: dto.emailFromLocalPart,
        reminderTone: dto.reminderTone,
        reminderCcEmail: dto.reminderCcEmail ?? null,
        withholdingAgentIncomeTax: dto.withholdingAgentIncomeTax,
        withholdingAgentVat: dto.withholdingAgentVat,
        withholdingAgentGrossIncome: dto.withholdingAgentGrossIncome,
        ownTaxCondition: dto.ownTaxCondition ?? null,
        fiscalAddress: dto.fiscalAddress ?? null,
        grossIncomeNumber: dto.grossIncomeNumber ?? null,
        activityStartDate: dto.activityStartDate ? new Date(dto.activityStartDate) : null,
        defaultMarkupPercent: dto.defaultMarkupPercent ?? null,
      },
      update: {
        arReminderIntervalDays: dto.arReminderIntervalDays,
        emailSenderMode: dto.emailSenderMode,
        emailFromName: dto.emailFromName,
        emailFromLocalPart: dto.emailFromLocalPart,
        reminderTone: dto.reminderTone,
        reminderCcEmail: dto.reminderCcEmail,
        withholdingAgentIncomeTax: dto.withholdingAgentIncomeTax,
        withholdingAgentVat: dto.withholdingAgentVat,
        withholdingAgentGrossIncome: dto.withholdingAgentGrossIncome,
        ownTaxCondition: dto.ownTaxCondition,
        fiscalAddress: dto.fiscalAddress,
        grossIncomeNumber: dto.grossIncomeNumber,
        activityStartDate: dto.activityStartDate === undefined ? undefined : dto.activityStartDate ? new Date(dto.activityStartDate) : null,
        defaultMarkupPercent: dto.defaultMarkupPercent,
      },
    });
    return this.toView(row, await this.getTenantTaxId());
  }

  /** Registers (or, if this tenant already registered this exact domain,
   * re-fetches) a sending domain with Resend under the app's single
   * account - idempotent so retrying after a page refresh doesn't create a
   * duplicate. Returns the DNS records the UI shows the user to add at
   * their registrar. */
  async registerCustomDomain(domain: string): Promise<DomainRegistrationResult> {
    if (!this.domains) {
      throw new BadRequestException(
        'El envío desde dominio propio no está configurado en este servidor',
      );
    }
    const tenantId = getTenantId();
    const existing = await getTenantDb().tenantSettings.findUnique({ where: { tenantId } });

    if (existing?.resendDomainId && existing.emailCustomDomain === domain) {
      const { data, error } = await this.domains.get(existing.resendDomainId);
      if (error || !data) {
        throw new BadRequestException(error?.message ?? 'No se pudo consultar el dominio en Resend');
      }
      await this.persistDomain(tenantId, domain, data.id, data.status);
      return { status: data.status, records: data.records };
    }

    const { data, error } = await this.domains.create({ name: domain });
    if (error || !data) {
      throw new BadRequestException(error?.message ?? 'No se pudo registrar el dominio en Resend');
    }
    await this.persistDomain(tenantId, domain, data.id, data.status);
    return { status: data.status, records: data.records };
  }

  /** "Verificar ahora" - kicks off Resend's DNS re-check and reports back
   * the current status, persisting it so resolveEmailFrom (used at
   * send-time) sees it without another Resend call. */
  async refreshDomainStatus(): Promise<DomainRegistrationResult> {
    if (!this.domains) {
      throw new BadRequestException(
        'El envío desde dominio propio no está configurado en este servidor',
      );
    }
    const tenantId = getTenantId();
    const existing = await getTenantDb().tenantSettings.findUnique({ where: { tenantId } });
    if (!existing?.resendDomainId || !existing.emailCustomDomain) {
      throw new BadRequestException('Todavía no registraste un dominio propio');
    }

    await this.domains.verify(existing.resendDomainId);
    const { data, error } = await this.domains.get(existing.resendDomainId);
    if (error || !data) {
      throw new BadRequestException(error?.message ?? 'No se pudo verificar el dominio en Resend');
    }
    await this.persistDomain(tenantId, existing.emailCustomDomain, data.id, data.status);
    return { status: data.status, records: data.records };
  }

  /** Validates the cert/key pair, encrypts both with EncryptionService and
   * upserts them - the plaintext PEMs never touch the database or a log
   * line, only this in-memory validation step. Overwrites whatever was
   * there before, if anything (re-uploading is how a tenant rotates an
   * expiring certificate). */
  async uploadAfipCertificate(dto: UploadAfipCertificateDto): Promise<TenantSettingsView> {
    const tenantId = getTenantId();
    const db = getTenantDb();
    const [existing, tenantTaxId] = await Promise.all([
      db.tenantSettings.findUnique({ where: { tenantId } }),
      this.getTenantTaxId(),
    ]);

    const certKind = detectAfipFileKind(dto.certPem);
    if (certKind === 'CSR') {
      throw new BadRequestException(
        'Ese archivo es el pedido (CSR), no el certificado. El certificado es lo que te devuelve ARCA después de pegar el pedido en WSASS.',
      );
    }
    if (certKind !== 'CERTIFICATE') {
      throw new BadRequestException('Ese archivo no es un certificado. Buscá el que te dio ARCA (empieza con "-----BEGIN CERTIFICATE-----").');
    }

    // Clave: la que se sube, o la que generó Oplex y está esperando.
    const usingPendingKey = !dto.keyPem;
    const pendingKeyEncrypted = existing?.afipPendingKeyEncrypted;
    let keyPem: string;
    if (dto.keyPem) {
      keyPem = dto.keyPem;
    } else if (pendingKeyEncrypted) {
      keyPem = this.encryption.decrypt(pendingKeyEncrypted);
    } else {
      throw new BadRequestException('Falta la clave privada: subila, o generala con Oplex en el paso 2.');
    }

    let info: ReturnType<typeof inspectAfipCertificate>;
    try {
      parseAndValidateAfipCertificate(dto.certPem, keyPem);
      info = inspectAfipCertificate(dto.certPem);
    } catch (error) {
      const message = (error as Error).message;
      throw new BadRequestException(
        usingPendingKey && message.includes('no corresponde')
          ? 'Este certificado no se generó con el pedido que creó Oplex. Usá el pedido del paso 2 en WSASS, o subí también tu propia clave privada.'
          : message,
      );
    }
    if (dto.env && dto.env !== info.env) {
      throw new BadRequestException(
        info.env === 'PRODUCCION'
          ? 'Este certificado es de PRODUCCIÓN (facturas reales) y elegiste Homologación.'
          : 'Este certificado es de HOMOLOGACIÓN (pruebas) y elegiste Producción.',
      );
    }
    const ownCuit = tenantTaxId?.replace(/\D/g, '') ?? null;
    if (ownCuit && info.cuit && info.cuit !== ownCuit) {
      throw new BadRequestException(
        `El certificado es del CUIT ${info.cuit} y la empresa tiene cargado ${ownCuit}. ARCA rechazaría las facturas.`,
      );
    }

    const data = {
      afipEnv: info.env,
      afipCertEncrypted: this.encryption.encrypt(dto.certPem),
      afipKeyEncrypted: this.encryption.encrypt(keyPem),
      afipCertExpiresAt: info.expiresAt,
      afipCertAlias: info.alias,
      // Certificado nuevo: los tickets de WSAA y el último chequeo eran del anterior.
      afipWsaaTicketsEncrypted: null,
      afipLastCheckAt: null,
      afipLastCheckOk: null,
      afipLastCheckMessage: null,
      ...(usingPendingKey ? { afipPendingKeyEncrypted: null, afipPendingCsr: null, afipPendingAlias: null } : {}),
    };
    const row = await db.tenantSettings.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data,
    });
    return this.toView(row, tenantTaxId);
  }

  async removeAfipCertificate(): Promise<TenantSettingsView> {
    const tenantId = getTenantId();
    const row = await getTenantDb().tenantSettings.upsert({
      where: { tenantId },
      create: { tenantId },
      update: {
        afipCertEncrypted: null,
        afipKeyEncrypted: null,
        afipCertExpiresAt: null,
        afipCertAlias: null,
        afipWsaaTicketsEncrypted: null,
        afipLastCheckAt: null,
        afipLastCheckOk: null,
        afipLastCheckMessage: null,
      },
    });
    return this.toView(row, await this.getTenantTaxId());
  }

  /** "Generar clave y pedido" (paso 2): la clave privada queda cifrada en
   * Oplex y nunca sale; el CSR (público) se devuelve para llevar a WSASS.
   * No toca el certificado ya cargado - la clave nueva queda "pendiente"
   * hasta que se suba el certificado que ARCA emita para este pedido. */
  async generateAfipCsr(alias: string | undefined): Promise<TenantSettingsView> {
    const tenantId = getTenantId();
    const db = getTenantDb();
    const tenant = await db.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    if (!tenant.taxId) {
      throw new BadRequestException('Cargá primero el CUIT de la empresa (paso 1).');
    }
    const finalAlias = alias?.trim() || 'oplex';
    const { keyPem, csrPem } = generateAfipKeyAndCsr({
      cuit: tenant.taxId,
      organization: tenant.name,
      alias: finalAlias,
    });
    const data = {
      afipPendingKeyEncrypted: this.encryption.encrypt(keyPem),
      afipPendingCsr: csrPem,
      afipPendingAlias: finalAlias,
    };
    const row = await db.tenantSettings.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data,
    });
    return this.toView(row, tenant.taxId);
  }

  /** Qué es un archivo y, si es un certificado, qué dice (titular,
   * ambiente, vencimiento) - para mostrarlo ANTES de guardar. */
  async inspectAfipFile(text: string): Promise<{
    kind: AfipFileKind;
    certificate: {
      alias: string | null;
      cuit: string | null;
      issuer: string | null;
      env: 'HOMOLOGACION' | 'PRODUCCION';
      expiresAt: Date;
      cuitMatches: boolean | null;
      matchesPendingKey: boolean | null;
    } | null;
  }> {
    const kind = detectAfipFileKind(text);
    if (kind !== 'CERTIFICATE') return { kind, certificate: null };
    let info: ReturnType<typeof inspectAfipCertificate>;
    try {
      info = inspectAfipCertificate(text);
    } catch {
      return { kind: 'UNKNOWN', certificate: null };
    }
    const tenantId = getTenantId();
    const [settings, tenantTaxId] = await Promise.all([
      getTenantDb().tenantSettings.findUnique({ where: { tenantId }, select: { afipPendingKeyEncrypted: true } }),
      this.getTenantTaxId(),
    ]);
    const ownCuit = tenantTaxId?.replace(/\D/g, '') ?? null;
    let matchesPendingKey: boolean | null = null;
    if (settings?.afipPendingKeyEncrypted) {
      try {
        parseAndValidateAfipCertificate(text, this.encryption.decrypt(settings.afipPendingKeyEncrypted));
        matchesPendingKey = true;
      } catch {
        matchesPendingKey = false;
      }
    }
    return {
      kind,
      certificate: {
        ...info,
        cuitMatches: ownCuit && info.cuit ? ownCuit === info.cuit : null,
        matchesPendingKey,
      },
    };
  }

  private async persistDomain(
    tenantId: string,
    domain: string,
    resendDomainId: string,
    status: string,
  ): Promise<void> {
    await getTenantDb().tenantSettings.upsert({
      where: { tenantId },
      create: { tenantId, emailCustomDomain: domain, resendDomainId, domainStatus: status },
      update: { emailCustomDomain: domain, resendDomainId, domainStatus: status },
    });
  }
}
