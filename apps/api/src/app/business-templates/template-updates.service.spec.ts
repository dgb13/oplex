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

describe('TemplateUpdatesService: estado según el presupuesto', () => {
  const BEFORE: BusinessTemplateConfig = {
    modules: [],
    suggestedCategories: [],
    workOrder: { docName: 'Orden de trabajo', statuses: [{ name: 'Recibido' }, { name: 'En reparación' }, { name: 'Entregado', final: true }] },
  };
  const NOW: BusinessTemplateConfig = {
    modules: [],
    suggestedCategories: [],
    workOrder: {
      docName: 'Orden de trabajo',
      statuses: [
        { name: 'Recibido' },
        { name: 'Presupuesto rechazado', quoteOutcome: 'REJECTED' },
        { name: 'En reparación', quoteOutcome: 'ACCEPTED' },
        { name: 'Entregado', final: true },
      ],
    },
  };

  function db(statuses: unknown[]) {
    return {
      category: { findMany: jest.fn().mockResolvedValue([]) },
      workOrderStatus: { findMany: jest.fn().mockResolvedValue(statuses) },
    };
  }

  it('marks the status the business already has and adds the rejected one', async () => {
    const service = new TemplateUpdatesService({} as PrismaService);
    const mine = [
      { id: 's1', name: 'Recibido', sortOrder: 0, active: true, quoteOutcome: null },
      { id: 's2', name: 'En reparación', sortOrder: 1, active: true, quoteOutcome: null },
      { id: 's3', name: 'Entregado', sortOrder: 2, active: true, quoteOutcome: null },
    ];
    const items = await runInTenant(db(mine), () => service.diff(BEFORE, NOW, []));
    expect(items).toEqual([
      { id: 'statusQuote:ACCEPTED', kind: 'statusQuote', name: 'En reparación', quoteOutcome: 'ACCEPTED' },
      {
        id: 'status:Presupuesto rechazado',
        kind: 'status',
        name: 'Presupuesto rechazado',
        after: 'Recibido',
        final: false,
        notifiesCustomer: false,
        quoteOutcome: 'REJECTED',
      },
    ]);
  });

  it('does not offer an outcome the business already marked on its own', async () => {
    const service = new TemplateUpdatesService({} as PrismaService);
    const mine = [
      { id: 's1', name: 'Recibido', sortOrder: 0, active: true, quoteOutcome: null },
      { id: 's2', name: 'Trabajando', sortOrder: 1, active: true, quoteOutcome: 'ACCEPTED' },
      { id: 's3', name: 'No quiso', sortOrder: 2, active: true, quoteOutcome: 'REJECTED' },
      { id: 's4', name: 'En reparación', sortOrder: 3, active: true, quoteOutcome: null },
      { id: 's5', name: 'Entregado', sortOrder: 4, active: true, quoteOutcome: null },
    ];
    const items = await runInTenant(db(mine), () => service.diff(BEFORE, NOW, []));
    // El estado nuevo se ofrece igual, pero sin la marca (ya la tiene "No quiso").
    expect(items.map((i) => i.id)).toEqual(['status:Presupuesto rechazado']);
    expect(items[0]).not.toHaveProperty('quoteOutcome');
  });
});

describe('TemplateUpdatesService: un campo pasa a la lista de vehículos', () => {
  const TEXT_FIELDS = [
    { key: 'patente', label: 'Patente', type: 'TEXT' as const, isIdentifier: true, required: true },
    { key: 'marca', label: 'Marca', type: 'TEXT' as const, required: true },
    { key: 'modelo', label: 'Modelo', type: 'TEXT' as const, required: true },
  ];
  const BEFORE: BusinessTemplateConfig = { modules: [], suggestedCategories: [], assetType: { name: 'Vehículo', fields: TEXT_FIELDS } };
  const NOW: BusinessTemplateConfig = {
    modules: [],
    suggestedCategories: [],
    assetType: {
      name: 'Vehículo',
      fields: [
        TEXT_FIELDS[0],
        { ...TEXT_FIELDS[1], type: 'VEHICLE_BRAND', vehicleKind: 'MOTO' },
        { ...TEXT_FIELDS[2], type: 'VEHICLE_MODEL' },
      ],
    },
  };

  function db(fields: unknown[]) {
    return {
      category: { findMany: jest.fn().mockResolvedValue([]) },
      customerAssetType: { findFirst: jest.fn().mockResolvedValue({ id: 'type-1', fields }) },
      workOrderStatus: { findMany: jest.fn().mockResolvedValue([]) },
    };
  }

  it('offers it with the name the business gave the field', async () => {
    const service = new TemplateUpdatesService({} as PrismaService);
    const mine = [TEXT_FIELDS[0], { ...TEXT_FIELDS[1], label: 'Marca del auto' }, TEXT_FIELDS[2]];
    const items = await runInTenant(db(mine), () => service.diff(BEFORE, NOW, []));
    expect(items).toEqual([
      { id: 'fieldType:marca', kind: 'fieldType', typeName: 'Vehículo', key: 'marca', label: 'Marca del auto', type: 'VEHICLE_BRAND', vehicleKind: 'MOTO' },
      { id: 'fieldType:modelo', kind: 'fieldType', typeName: 'Vehículo', key: 'modelo', label: 'Modelo', type: 'VEHICLE_MODEL' },
    ]);
  });

  it('skips a field the business changed or hid on its own', async () => {
    const service = new TemplateUpdatesService({} as PrismaService);
    const mine = [TEXT_FIELDS[0], { ...TEXT_FIELDS[1], type: 'SELECT', options: ['Ford'] }, { ...TEXT_FIELDS[2], hidden: true }];
    const items = await runInTenant(db(mine), () => service.diff(BEFORE, NOW, []));
    expect(items).toEqual([]);
  });
});
