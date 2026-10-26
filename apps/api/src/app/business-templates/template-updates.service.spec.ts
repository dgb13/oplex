import { tenantContextStorage, type PrismaService } from '@plexo/database';
import type { BusinessTemplateConfig } from './business-templates.service.js';
import { TemplateUpdatesService } from './template-updates.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

const V1: BusinessTemplateConfig = {
  modules: ['presupuestos', 'fichas'],
  suggestedCategories: ['Repuestos'],
  assetType: {
    name: 'Vehículo',
    fields: [
      { key: 'patente', label: 'Patente', type: 'TEXT', isIdentifier: true, required: true },
      { key: 'km', label: 'Kilómetros', type: 'NUMBER' },
    ],
  },
  workOrder: { docName: 'Orden de trabajo', statuses: [{ name: 'Recibido' }, { name: 'En reparación' }, { name: 'Entregado', final: true }] },
};

const V2: BusinessTemplateConfig = {
  modules: ['presupuestos', 'fichas', 'agenda', 'caja'],
  suggestedCategories: ['Repuestos', 'Lubricantes', 'Filtros'],
  assetType: {
    name: 'Vehículo',
    fields: [
      ...(V1.assetType?.fields ?? []),
      { key: 'combustible', label: 'Combustible', type: 'SELECT', options: ['Nafta', 'GNC'] },
      { key: 'color', label: 'Color', type: 'TEXT' },
    ],
  },
  workOrder: {
    docName: 'Orden de trabajo',
    statuses: [{ name: 'Recibido' }, { name: 'Esperando repuesto' }, { name: 'En reparación' }, { name: 'Entregado', final: true }],
  },
};

function makeDb() {
  return {
    category: { findMany: jest.fn().mockResolvedValue([{ name: 'filtros' }]) },
    customerAssetType: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'type-1',
        fields: [...(V1.assetType?.fields ?? []), { key: 'color', label: 'Color', type: 'TEXT' }],
      }),
    },
    workOrderStatus: {
      findMany: jest.fn().mockResolvedValue([
        { id: 's1', name: 'Recibido', sortOrder: 0 },
        { id: 's2', name: 'En reparación', sortOrder: 1 },
        { id: 's3', name: 'Entregado', sortOrder: 2 },
      ]),
    },
  };
}

describe('TemplateUpdatesService.diff', () => {
  it('offers only what is new in the template and the business does not have yet', async () => {
    const service = new TemplateUpdatesService({} as PrismaService);

    const items = await runInTenant(makeDb(), () => service.diff(V1, V2, ['presupuestos', 'fichas', 'caja']));

    expect(items.map((i) => i.id)).toEqual([
      // caja ya estaba prendido; agenda no.
      'module:agenda',
      // Filtros ya existe como categoría del negocio.
      'category:Lubricantes',
      // Color ya lo había agregado el negocio a mano.
      'assetField:combustible',
      'status:Esperando repuesto',
    ]);
    expect(items.find((i) => i.kind === 'status')).toMatchObject({ after: 'Recibido', final: false });
  });

  it('never offers to remove what the template took out', async () => {
    const service = new TemplateUpdatesService({} as PrismaService);
    const items = await runInTenant(makeDb(), () => service.diff(V2, V1, ['presupuestos', 'fichas']));
    expect(items).toEqual([]);
  });
});
