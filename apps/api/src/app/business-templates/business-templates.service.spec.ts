import type { PrismaService } from '@plexo/database';
import { BusinessTemplatesService, slugifyTemplateName } from './business-templates.service.js';

const CURRENT = {
  id: 'tpl-1',
  key: 'taller-mecanico',
  name: 'Taller mecánico',
  family: 'Automotor',
  iconKey: 'Car',
  sortOrder: 10,
  isActive: true,
  version: 2,
  config: {
    modules: ['caja'],
    suggestedCategories: ['Repuestos'],
    assetType: { name: 'Vehículo', fields: [] },
    workOrder: { docName: 'Orden de trabajo', statuses: [] },
  },
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makePrisma() {
  const tx = {
    businessTemplate: { update: jest.fn(({ data }) => Promise.resolve({ ...CURRENT, ...data })) },
    businessTemplateVersion: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    businessTemplate: { findUnique: jest.fn().mockResolvedValue(CURRENT) },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return { prisma: prisma as unknown as PrismaService, tx };
}

describe('BusinessTemplatesService.update', () => {
  it('publishes a new version when the config changes, keeping the fichas and work order setup', async () => {
    const { prisma, tx } = makePrisma();
    const service = new BusinessTemplatesService(prisma);

    const result = await service.update(
      'tpl-1',
      { config: { modules: ['caja', 'agenda'], suggestedCategories: ['Repuestos', ' Lubricantes '], notice: 'Aviso' } },
      'admin@oplex.com.ar',
    );

    expect(result.version).toBe(3);
    expect(result.config).toEqual({
      modules: ['caja', 'agenda'],
      suggestedCategories: ['Repuestos', 'Lubricantes'],
      notice: 'Aviso',
      assetType: { name: 'Vehículo', fields: [] },
      workOrder: { docName: 'Orden de trabajo', statuses: [] },
    });
    expect(tx.businessTemplateVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ templateId: 'tpl-1', version: 3, publishedBy: 'admin@oplex.com.ar' }),
    });
  });

  it('saving the same config with its keys in another order does not publish a new version', async () => {
    const { prisma, tx } = makePrisma();
    const service = new BusinessTemplatesService(prisma);

    await service.update('tpl-1', { config: { suggestedCategories: ['Repuestos'], modules: ['caja'] } }, 'admin@oplex.com.ar');

    expect(tx.businessTemplateVersion.create).not.toHaveBeenCalled();
  });

  it('renaming or changing the icon does not publish a new version', async () => {
    const { prisma, tx } = makePrisma();
    const service = new BusinessTemplatesService(prisma);

    const result = await service.update('tpl-1', { name: 'Taller', iconKey: 'Wrench' }, 'admin@oplex.com.ar');

    expect(result.version).toBe(2);
    expect(tx.businessTemplateVersion.create).not.toHaveBeenCalled();
  });
});

describe('slugifyTemplateName', () => {
  it('builds the same keys as the initial migration', () => {
    expect(slugifyTemplateName('Taller mecánico')).toBe('taller-mecanico');
    expect(slugifyTemplateName('Hotel, hostel y cabañas')).toBe('hotel-hostel-y-cabanas');
  });
});
