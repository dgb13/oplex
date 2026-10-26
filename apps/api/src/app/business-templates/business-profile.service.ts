import { BadRequestException, Injectable } from '@nestjs/common';
import { getTenantDb, getTenantId } from '@plexo/database';
import { AVAILABLE_MODULE_KEYS, BUSINESS_MODULE_KEYS, LEGACY_MODULE_KEYS } from './business-modules.js';
import { CustomerAssetsService, type TemplateAssetType } from '../customer-assets/customer-assets.service.js';
import { BusinessTemplatesService, type BusinessTemplateView } from './business-templates.service.js';

export interface BusinessProfileView {
  /** Rubro elegido; null si es un negocio previo o todavía no eligió. */
  template: Pick<BusinessTemplateView, 'key' | 'name' | 'family' | 'iconKey' | 'version'> & {
    notice: string | null;
    /** Módulos que trae la plantilla vigente (para marcar "de tu rubro"). */
    modules: string[];
  } | null;
  /** Versión de la plantilla que se aplicó a este negocio. */
  appliedVersion: number | null;
  /** Alta nueva que todavía no eligió rubro: la web le pide elegirlo. */
  pending: boolean;
  /** false = negocio previo sin configurar: se ve todo, como antes. */
  modulesConfigured: boolean;
  enabledModules: string[];
}

export interface ChooseResult extends BusinessProfileView {
  createdCategories: string[];
}

/**
 * Rubro y módulos del negocio que hace el pedido (tenant_settings, con RLS).
 * Elegir un rubro aplica una COPIA de la plantilla: módulos, categorías
 * sugeridas y garantía por defecto. Nunca borra ni apaga nada que el
 * negocio ya usaba: un negocio previo (modulesConfigured = false) arranca
 * con todos los módulos de hoy prendidos y el rubro sólo suma.
 */
@Injectable()
export class BusinessProfileService {
  constructor(
    private readonly templates: BusinessTemplatesService,
    private readonly assets: CustomerAssetsService,
  ) {}

  async getProfile(): Promise<BusinessProfileView> {
    const settings = await getTenantDb().tenantSettings.findUnique({ where: { tenantId: getTenantId() } });
    const template = settings?.businessTemplateKey ? await this.templates.findByKey(settings.businessTemplateKey) : null;
    return {
      template: template
        ? {
            key: template.key,
            name: template.name,
            family: template.family,
            iconKey: template.iconKey,
            version: template.version,
            notice: template.config.notice ?? null,
            modules: template.config.modules,
          }
        : null,
      appliedVersion: settings?.businessTemplateVersion ?? null,
      pending: settings?.businessTemplatePending ?? false,
      modulesConfigured: settings?.modulesConfigured ?? false,
      enabledModules: settings?.enabledModules ?? [],
    };
  }

  async choose(key: string): Promise<ChooseResult> {
    const template = await this.templates.findActiveByKey(key);
    if (!template) throw new BadRequestException('Ese rubro no existe o ya no está disponible');

    const tenantId = getTenantId();
    const db = getTenantDb();
    const settings = await db.tenantSettings.findUnique({ where: { tenantId } });

    // Punto de partida: lo que el negocio ya tiene prendido. Un negocio
    // previo sin configurar ve todo hoy, así que arranca con todo; un alta
    // nueva (pending) arranca vacía y toma sólo lo de su rubro.
    const base = settings?.modulesConfigured
      ? settings.enabledModules
      : settings?.businessTemplatePending
        ? []
        : [...LEGACY_MODULE_KEYS];
    const enabledModules = unique([...base, ...template.config.modules]).filter((k) => BUSINESS_MODULE_KEYS.includes(k));

    const warranty = template.config.defaultWarranty;
    await db.tenantSettings.upsert({
      where: { tenantId },
      create: {
        tenantId,
        businessTemplateKey: template.key,
        businessTemplateVersion: template.version,
        businessTemplatePending: false,
        modulesConfigured: true,
        enabledModules,
        quoteDefaultWarranty: warranty ?? null,
      },
      update: {
        businessTemplateKey: template.key,
        businessTemplateVersion: template.version,
        businessTemplatePending: false,
        modulesConfigured: true,
        enabledModules,
        // La garantía sólo se completa si el negocio no había puesto una.
        ...(warranty && !settings?.quoteDefaultWarranty ? { quoteDefaultWarranty: warranty } : {}),
      },
    });

    // Categorías sugeridas que todavía no existen (por nombre, en la raíz).
    const existing = await db.category.findMany({ where: { parentId: null }, select: { name: true } });
    const existingNames = new Set(existing.map((c) => c.name.trim().toLowerCase()));
    const createdCategories = template.config.suggestedCategories.filter((name) => !existingNames.has(name.toLowerCase()));
    if (createdCategories.length > 0) {
      await db.category.createMany({ data: createdCategories.map((name) => ({ tenantId, name })) });
    }

    // Ficha del rubro (Vehículo en un taller): se crea si el negocio usa Fichas.
    const assetType = template.config.assetType as TemplateAssetType | undefined;
    if (assetType && enabledModules.includes('fichas')) await this.assets.ensureTypeFromTemplate(assetType);

    return { ...(await this.getProfile()), createdCategories };
  }

  /** "Lo elijo después": deja de pedirlo y el negocio ve todo, como antes. */
  async skip(): Promise<BusinessProfileView> {
    const tenantId = getTenantId();
    await getTenantDb().tenantSettings.upsert({
      where: { tenantId },
      create: { tenantId, businessTemplatePending: false },
      update: { businessTemplatePending: false },
    });
    return this.getProfile();
  }

  /** Configuración → Módulos. Sólo se cambian los que existen hoy; los que
   * trajo el rubro y todavía no salieron (fichas, órdenes de trabajo...)
   * quedan como estaban. */
  async updateModules(requested: string[]): Promise<BusinessProfileView> {
    const tenantId = getTenantId();
    const db = getTenantDb();
    const settings = await db.tenantSettings.findUnique({ where: { tenantId } });
    const current = settings?.modulesConfigured ? settings.enabledModules : [...LEGACY_MODULE_KEYS];
    const enabledModules = unique([
      ...requested.filter((k) => AVAILABLE_MODULE_KEYS.includes(k)),
      ...current.filter((k) => !AVAILABLE_MODULE_KEYS.includes(k)),
    ]);
    await db.tenantSettings.upsert({
      where: { tenantId },
      create: { tenantId, modulesConfigured: true, enabledModules },
      update: { modulesConfigured: true, enabledModules },
    });
    return this.getProfile();
  }

  async requestTemplate(text: string) {
    await this.templates.createRequest(text, getTenantId());
    return { ok: true };
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
