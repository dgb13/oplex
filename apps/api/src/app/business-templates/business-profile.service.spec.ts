import { tenantContextStorage } from '@plexo/database';
import { LEGACY_MODULE_KEYS } from './business-modules.js';
import type { CustomerAssetsService } from '../customer-assets/customer-assets.service.js';
import { BusinessProfileService } from './business-profile.service.js';
import type { BusinessTemplatesService, BusinessTemplateView } from './business-templates.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

const TALLER: BusinessTemplateView = {
  id: 'tpl-taller',
  key: 'taller-mecanico',
  name: 'Taller mecánico',
  family: 'Automotor',
  iconKey: 'Car',
  sortOrder: 10,
  isActive: true,
  version: 3,
  config: {
    modules: ['presupuestos', 'ordenes-trabajo', 'fichas', 'caja'],
    suggestedCategories: ['Repuestos', 'Mano de obra'],
    defaultWarranty: '3 meses o 5.000 km en mano de obra',
    assetType: { name: 'Vehículo', fields: [{ key: 'patente', label: 'Patente', type: 'TEXT', isIdentifier: true }] },
  },
  updatedAt: new Date(),
};

function makeTemplates(template: BusinessTemplateView | null = TALLER) {
  return {
    findActiveByKey: jest.fn().mockResolvedValue(template),
    findByKey: jest.fn().mockResolvedValue(template),
    createRequest: jest.fn().mockResolvedValue({}),
  } as unknown as BusinessTemplatesService;
}

function makeAssets() {
  return { ensureTypeFromTemplate: jest.fn().mockResolvedValue(undefined) } as unknown as CustomerAssetsService;
}

function makeDb(settings: Record<string, unknown> | null, categories: { name: string }[] = []) {
  return {
    tenantSettings: {
      findUnique: jest.fn().mockResolvedValue(settings),
      upsert: jest.fn().mockResolvedValue({}),
    },
    category: {
      findMany: jest.fn().mockResolvedValue(categories),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

describe('BusinessProfileService.choose', () => {
  it('a new signup gets only the modules of its rubro, the suggested categories and the default warranty', async () => {
    const db = makeDb({ businessTemplatePending: true, modulesConfigured: false, enabledModules: [], quoteDefaultWarranty: null });
    const service = new BusinessProfileService(makeTemplates(), makeAssets());

    const result = await runInTenant(db, () => service.choose('taller-mecanico'));

    const upsert = db.tenantSettings.upsert.mock.calls[0][0];
    expect(upsert.update).toMatchObject({
      businessTemplateKey: 'taller-mecanico',
      businessTemplateVersion: 3,
      businessTemplatePending: false,
      modulesConfigured: true,
      enabledModules: ['presupuestos', 'ordenes-trabajo', 'fichas', 'caja'],
      quoteDefaultWarranty: '3 meses o 5.000 km en mano de obra',
    });
    expect(db.category.createMany).toHaveBeenCalledWith({
      data: [
        { tenantId: 'tenant-1', name: 'Repuestos' },
        { tenantId: 'tenant-1', name: 'Mano de obra' },
      ],
    });
    expect(result.createdCategories).toEqual(['Repuestos', 'Mano de obra']);
  });

  it('creates the rubro ficha (Vehículo) when the business uses Fichas', async () => {
    const db = makeDb({ businessTemplatePending: true, modulesConfigured: false, enabledModules: [] });
    const assets = makeAssets();
    const service = new BusinessProfileService(makeTemplates(), assets);

    await runInTenant(db, () => service.choose('taller-mecanico'));

    expect(assets.ensureTypeFromTemplate).toHaveBeenCalledWith(expect.objectContaining({ name: 'Vehículo' }));
  });

  it('an existing business keeps every module it sees today: the rubro only adds', async () => {
    const db = makeDb({ businessTemplatePending: false, modulesConfigured: false, enabledModules: [] });
    const service = new BusinessProfileService(makeTemplates(), makeAssets());

    await runInTenant(db, () => service.choose('taller-mecanico'));

    const enabled: string[] = db.tenantSettings.upsert.mock.calls[0][0].update.enabledModules;
    for (const key of LEGACY_MODULE_KEYS) expect(enabled).toContain(key);
    expect(enabled).toEqual(expect.arrayContaining(['ordenes-trabajo', 'fichas']));
  });

  it('does not overwrite a warranty the business already wrote, nor duplicate categories it already has', async () => {
    const db = makeDb(
      { businessTemplatePending: false, modulesConfigured: true, enabledModules: ['caja'], quoteDefaultWarranty: 'Mi garantía' },
      [{ name: 'repuestos' }],
    );
    const service = new BusinessProfileService(makeTemplates(), makeAssets());

    const result = await runInTenant(db, () => service.choose('taller-mecanico'));

    const update = db.tenantSettings.upsert.mock.calls[0][0].update;
    expect(update.quoteDefaultWarranty).toBeUndefined();
    expect(update.enabledModules).toEqual(['caja', 'presupuestos', 'ordenes-trabajo', 'fichas']);
    expect(result.createdCategories).toEqual(['Mano de obra']);
  });

  it('rejects a rubro that does not exist or was deactivated', async () => {
    const service = new BusinessProfileService(makeTemplates(null), makeAssets());
    await expect(runInTenant(makeDb(null), () => service.choose('no-existe'))).rejects.toThrow('Ese rubro no existe');
  });
});

describe('BusinessProfileService.updateModules', () => {
  it('toggles the modules that exist today (Fichas included) and keeps the upcoming ones the rubro brought', async () => {
    const db = makeDb({ modulesConfigured: true, enabledModules: ['caja', 'presupuestos', 'ordenes-trabajo'] });
    const service = new BusinessProfileService(makeTemplates(), makeAssets());

    await runInTenant(db, () => service.updateModules(['agenda', 'fichas']));

    expect(db.tenantSettings.upsert.mock.calls[0][0].update).toEqual({
      modulesConfigured: true,
      enabledModules: ['agenda', 'fichas', 'ordenes-trabajo'],
    });
  });
});
