import { BadRequestException, Injectable } from '@nestjs/common';
import { getTenantDb, getTenantId, Prisma, PrismaService } from '@plexo/database';
import {
  assertVehicleFields,
  canChangeFieldType,
  readFields,
  type AssetFieldDef,
  type AssetFieldType,
  type VehicleKind,
} from '../customer-assets/asset-fields.js';
import type { QuoteOutcome } from '../work-orders/dto/work-order.dto.js';
import { BUSINESS_MODULE_KEYS } from './business-modules.js';
import { readConfig, type BusinessTemplateConfig } from './business-templates.service.js';

export type TemplateUpdateItem =
  | { id: string; kind: 'module'; key: string }
  | { id: string; kind: 'category'; name: string }
  | { id: string; kind: 'assetField'; typeName: string; field: AssetFieldDef }
  // Un campo que el negocio ya tiene pasa a elegirse de una lista (Marca y
  // Modelo de la lista de vehículos). Sólo entre tipos de texto: lo cargado
  // sigue valiendo.
  | { id: string; kind: 'fieldType'; typeName: string; key: string; label: string; type: AssetFieldType; vehicleKind?: VehicleKind }
  | {
      id: string;
      kind: 'status';
      name: string;
      after: string | null;
      final: boolean;
      notifiesCustomer: boolean;
      quoteOutcome?: QuoteOutcome;
    }
  // Un estado que el negocio ya tiene pasa a recibir solas las órdenes
  // cuando el cliente acepta o rechaza el presupuesto.
  | { id: string; kind: 'statusQuote'; name: string; quoteOutcome: QuoteOutcome };

export interface TemplateUpdates {
  templateName: string;
  fromVersion: number;
  toVersion: number;
  items: TemplateUpdateItem[];
}

/**
 * "Hay novedades para tu rubro" (etapa 6 del plan de rubros). Compara la
 * versión de la plantilla que el negocio aplicó con la vigente y ofrece lo
 * NUEVO que todavía no tiene: módulos, categorías, campos de la ficha y
 * estados de las órdenes. Aplicar sólo agrega; nunca cambia ni borra lo que
 * el negocio ya configuró. Lo que la plantilla sacó no se ofrece (no se
 * quita nada a nadie).
 */
@Injectable()
export class TemplateUpdatesService {
  constructor(private readonly prisma: PrismaService) {}

  async pending(): Promise<TemplateUpdates | null> {
    const db = getTenantDb();
    const tenantId = getTenantId();
    const settings = await db.tenantSettings.findUnique({ where: { tenantId } });
    if (!settings?.businessTemplateKey || settings.businessTemplateVersion == null) return null;
    const template = await this.prisma.businessTemplate.findUnique({ where: { key: settings.businessTemplateKey } });
    if (!template || template.version <= settings.businessTemplateVersion) return null;
    if (settings.dismissedTemplateVersion != null && settings.dismissedTemplateVersion >= template.version) return null;

    const applied = await this.prisma.businessTemplateVersion.findUnique({
      where: { templateId_version: { templateId: template.id, version: settings.businessTemplateVersion } },
    });
    const before = applied ? readConfig(applied) : { modules: [], suggestedCategories: [] };
    const now = readConfig(template);
    const items = await this.diff(before, now, settings.enabledModules);

    // Nada para ofrecer (cambió algo que este negocio ya tiene): se lo da por
    // al día sin tocar nada, así no se recalcula en cada visita.
    if (items.length === 0) {
      await db.tenantSettings.update({ where: { tenantId }, data: { businessTemplateVersion: template.version } });
      return null;
    }
    return { templateName: template.name, fromVersion: settings.businessTemplateVersion, toVersion: template.version, items };
  }

  /** Lo nuevo de `now` respecto de `before` que el negocio todavía no tiene. */
  async diff(before: BusinessTemplateConfig, now: BusinessTemplateConfig, enabledModules: string[]): Promise<TemplateUpdateItem[]> {
    const db = getTenantDb();
    const items: TemplateUpdateItem[] = [];

    for (const key of now.modules) {
      if (!before.modules.includes(key) && !enabledModules.includes(key) && BUSINESS_MODULE_KEYS.includes(key)) {
        items.push({ id: `module:${key}`, kind: 'module', key });
      }
    }

    const newCategories = now.suggestedCategories.filter(
      (c) => !before.suggestedCategories.some((b) => b.toLowerCase() === c.toLowerCase()),
    );
    if (newCategories.length > 0) {
      const existing = await db.category.findMany({ where: { parentId: null }, select: { name: true } });
      const names = new Set(existing.map((c) => c.name.trim().toLowerCase()));
      for (const name of newCategories) {
        if (!names.has(name.toLowerCase())) items.push({ id: `category:${name}`, kind: 'category', name });
      }
    }

    if (now.assetType) {
      const beforeFields = readFields(before.assetType?.fields);
      const beforeKeys = new Set(beforeFields.map((f) => f.key));
      const nowFields = readFields(now.assetType.fields);
      const newFields = nowFields.filter((f) => !beforeKeys.has(f.key) && !f.isIdentifier);
      const retyped = nowFields.filter((f) => {
        const prev = beforeFields.find((b) => b.key === f.key);
        return prev && prev.type !== f.type && !f.isIdentifier && canChangeFieldType(prev.type, f.type);
      });
      if (newFields.length > 0 || retyped.length > 0) {
        const type = await db.customerAssetType.findFirst({ where: { name: now.assetType.name, active: true } });
        const tenantFields = readFields(type?.fields);
        const have = new Set(tenantFields.map((f) => f.key));
        // Sin ficha todavía: se crea entera al prender Fichas, no hace falta ofrecer campos.
        if (type) {
          for (const field of newFields) {
            if (have.has(field.key)) continue;
            have.add(field.key);
            items.push({ id: `assetField:${field.key}`, kind: 'assetField', typeName: now.assetType.name, field });
          }
          for (const field of retyped) {
            const prevType = beforeFields.find((b) => b.key === field.key)?.type;
            const mine = tenantFields.find((f) => f.key === field.key);
            // Sólo si el negocio no le cambió el tipo por su cuenta.
            if (!mine || mine.hidden || mine.type !== prevType) continue;
            items.push({
              id: `fieldType:${field.key}`,
              kind: 'fieldType',
              typeName: now.assetType.name,
              key: field.key,
              label: mine.label,
              type: field.type,
              ...(field.vehicleKind ? { vehicleKind: field.vehicleKind } : {}),
            });
          }
        }
      }
    }

    if (now.workOrder) {
      const beforeStatuses = before.workOrder?.statuses ?? [];
      const beforeNames = new Set(beforeStatuses.map((s) => s.name.toLowerCase()));
      const tenantStatuses = await db.workOrderStatus.findMany({ orderBy: { sortOrder: 'asc' } });
      // Sin estados todavía: se crean todos al entrar a Órdenes de trabajo.
      if (tenantStatuses.length > 0) {
        const have = new Set(tenantStatuses.map((s) => s.name.toLowerCase()));
        const templateStatuses = now.workOrder.statuses;
        // Resultados que el negocio ya tiene marcados (a mano o por una
        // novedad anterior): no se ofrece otro.
        const taken = new Set(tenantStatuses.filter((s) => s.active && s.quoteOutcome).map((s) => s.quoteOutcome));
        for (const s of templateStatuses) {
          if (!s.quoteOutcome || taken.has(s.quoteOutcome)) continue;
          const wasMarked = beforeStatuses.some((b) => b.name.toLowerCase() === s.name.toLowerCase() && b.quoteOutcome === s.quoteOutcome);
          const mine = tenantStatuses.find((t) => t.active && t.name.toLowerCase() === s.name.toLowerCase());
          if (wasMarked || !mine) continue;
          taken.add(s.quoteOutcome);
          items.push({ id: `statusQuote:${s.quoteOutcome}`, kind: 'statusQuote', name: mine.name, quoteOutcome: s.quoteOutcome });
        }
        templateStatuses.forEach((s, i) => {
          if (beforeNames.has(s.name.toLowerCase()) || have.has(s.name.toLowerCase())) return;
          have.add(s.name.toLowerCase());
          items.push({
            id: `status:${s.name}`,
            kind: 'status',
            name: s.name,
            after: i > 0 ? templateStatuses[i - 1].name : null,
            final: Boolean(s.final),
            notifiesCustomer: Boolean(s.notifiesCustomer),
            ...(s.quoteOutcome && !taken.has(s.quoteOutcome) ? { quoteOutcome: s.quoteOutcome } : {}),
          });
          if (s.quoteOutcome) taken.add(s.quoteOutcome);
        });
      }
    }
    return items;
  }

  /** Aplica las novedades elegidas (sólo agrega) y deja al negocio al día. */
  async apply(ids: string[]): Promise<{ applied: number }> {
    const updates = await this.pending();
    if (!updates) throw new BadRequestException('No hay novedades para aplicar');
    const chosen = updates.items.filter((i) => ids.includes(i.id));
    const db = getTenantDb();
    const tenantId = getTenantId();
    const settings = await db.tenantSettings.findUniqueOrThrow({ where: { tenantId } });

    const modules = chosen.filter((i): i is Extract<TemplateUpdateItem, { kind: 'module' }> => i.kind === 'module').map((i) => i.key);
    const categories = chosen.filter((i): i is Extract<TemplateUpdateItem, { kind: 'category' }> => i.kind === 'category');
    const fields = chosen.filter((i): i is Extract<TemplateUpdateItem, { kind: 'assetField' }> => i.kind === 'assetField');
    const retyped = chosen.filter((i): i is Extract<TemplateUpdateItem, { kind: 'fieldType' }> => i.kind === 'fieldType');
    const statuses = chosen.filter((i): i is Extract<TemplateUpdateItem, { kind: 'status' }> => i.kind === 'status');
    const statusQuotes = chosen.filter((i): i is Extract<TemplateUpdateItem, { kind: 'statusQuote' }> => i.kind === 'statusQuote');

    await db.$transaction(async (tx) => {
      if (categories.length > 0) {
        await tx.category.createMany({ data: categories.map((c) => ({ tenantId, name: c.name })) });
      }
      if (fields.length > 0 || retyped.length > 0) {
        const typeName = fields[0]?.typeName ?? retyped[0].typeName;
        const type = await tx.customerAssetType.findFirst({ where: { name: typeName, active: true } });
        if (type) {
          const current = readFields(type.fields).map((f) => {
            const change = retyped.find((r) => r.key === f.key);
            if (!change) return f;
            const next: AssetFieldDef = { ...f, type: change.type };
            delete next.vehicleKind;
            if (change.vehicleKind) next.vehicleKind = change.vehicleKind;
            return next;
          });
          const added = fields.map((f) => f.field).filter((f) => !current.some((c) => c.key === f.key));
          const next = [...current, ...added];
          // Ej.: Modelo según la marca sin elegir también Marca.
          assertVehicleFields(next);
          await tx.customerAssetType.update({
            where: { tenantId_id: { tenantId, id: type.id } },
            data: { fields: next as unknown as Prisma.InputJsonValue },
          });
        }
      }
      for (const status of statuses) {
        // Va después del estado que lo precede en la plantilla (o al final).
        const list = await tx.workOrderStatus.findMany({ orderBy: { sortOrder: 'asc' } });
        const afterIndex = status.after ? list.findIndex((s) => s.name.toLowerCase() === status.after?.toLowerCase()) : -1;
        const position = afterIndex >= 0 ? afterIndex + 1 : list.length;
        for (const s of list.slice(position)) {
          await tx.workOrderStatus.update({ where: { tenantId_id: { tenantId, id: s.id } }, data: { sortOrder: s.sortOrder + 1 } });
        }
        await tx.workOrderStatus.create({
          data: {
            tenantId,
            name: status.name,
            sortOrder: position,
            isFinal: status.final,
            notifiesCustomer: status.notifiesCustomer,
            quoteOutcome: status.quoteOutcome ?? null,
          },
        });
      }
      for (const mark of statusQuotes) {
        const list = await tx.workOrderStatus.findMany();
        const target = list.find((s) => s.active && s.name.toLowerCase() === mark.name.toLowerCase());
        if (!target || list.some((s) => s.active && s.quoteOutcome === mark.quoteOutcome)) continue;
        await tx.workOrderStatus.update({ where: { tenantId_id: { tenantId, id: target.id } }, data: { quoteOutcome: mark.quoteOutcome } });
      }
      await tx.tenantSettings.update({
        where: { tenantId },
        data: {
          businessTemplateVersion: updates.toVersion,
          dismissedTemplateVersion: null,
          ...(modules.length > 0
            ? { modulesConfigured: true, enabledModules: [...new Set([...settings.enabledModules, ...modules])] }
            : {}),
        },
      });
    });
    return { applied: chosen.length };
  }

  /** "Ahora no": esta versión no se vuelve a ofrecer. */
  async dismiss(): Promise<void> {
    const updates = await this.pending();
    if (!updates) return;
    await getTenantDb().tenantSettings.update({
      where: { tenantId: getTenantId() },
      data: { dismissedTemplateVersion: updates.toVersion },
    });
  }
}
